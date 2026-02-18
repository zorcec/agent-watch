/**
 * Module: reviewEngine.ts
 *
 * Description:
 *   Core review engine for AgentWatch. Implements an agentic review loop where
 *   the LLM can explore the full codebase before producing its final review.
 *
 *   Flow:
 *   1. The agent receives the diff + git history for the changed file.
 *   2. It can call workspace tools (readFile, searchCode, listDirectory) to gather
 *      context — follow imports, check callers, inspect related files, etc.
 *   3. The loop continues until the agent responds with plain JSON (no tool calls),
 *      or until the safety limit (MAX_AGENT_ITERATIONS) is reached.
 *
 *   This enables complex reasoning: the agent is not limited to the diff alone.
 *
 * Usage:
 *   import { reviewFile, reviewFiles } from './reviewEngine';
 *   const issues = await reviewFile('src/auth.ts');
 */

import * as vscode from 'vscode';
import type { ReviewIssue, RiskTier } from '../types';
import { getFileDiff, getRecentHistory } from '../git/gitService';
import { truncateText } from '../utils';
import { loadUserInstructions, getUserInstructionsText } from '../instructions/instructionsLoader';
import { executeToolCall } from './workspaceTools';

/** Maximum diff size in characters to send to the LLM */
let maxDiffChars = 15_000;

/** Output channel for logging */
let outputChannel: vscode.OutputChannel | undefined;

/** Model family to use for LLM calls (default: gpt-4o) */
let modelFamily = 'gpt-4o';

/** Maximum agentic loop iterations before forcing a final response */
const MAX_AGENT_ITERATIONS = 10;

/**
 * Risk taxonomy included in every review prompt.
 */
const RISK_TAXONOMY = `Risk categories to evaluate:
1. Security surface: auth, input handling, secrets, permissions, token validation
2. Contract changes: public APIs, exported types, DB schema, env vars, configuration
3. Removed safety nets: deleted error handlers, dropped validations, removed tests
4. New dependencies: added packages, version bumps in package.json/requirements.txt
5. Logic in critical paths: payments, data writes, state mutations, side effects`;

/**
 * System prompt for the review LLM call.
 */
/**
 * Internal system prompt base for the review LLM call.
 * This contains the hardcoded internal instructions that are always present.
 * User-defined instructions from agent-watch-instructions.md are appended dynamically.
 */
const SYSTEM_PROMPT_BASE = `You are AgentWatch, a risk-focused code reviewer embedded in VS Code.
Your job is to identify issues that a HUMAN must verify. You are not writing a summary.

${RISK_TAXONOMY}

You have tools to explore the full codebase before finalizing your review:
- readFile(path): Read the full content of any file in the workspace.
- searchCode(query, include?): Search for a text/regex pattern across the codebase.
- listDirectory(path): List files and folders in a directory.

Use tools whenever you need to:
- Follow an import or dependency to understand context
- Check all callers of a changed function
- Verify how a changed type or interface is used elsewhere
- Inspect related files that may be affected

Rules:
- Only flag things a human must verify. Do NOT flag style, formatting, comments, or changes you are confident are correct.
- If you see no issues, return an empty JSON array.
- Assign each issue a risk tier: "high", "medium", or "low".
- Be specific about the line number (1-based, from the new file version).
- Keep titles under 80 characters.
- Keep explanations under 300 characters.

When you are done exploring and ready to finalize, respond with ONLY a valid JSON array.
No markdown, no code fences, no explanation outside the JSON.

JSON schema for each element:
{
  "tier": "high" | "medium" | "low",
  "file": "<relative file path>",
  "line": <1-based line number>,
  "title": "<short title>",
  "explanation": "<detailed explanation>"
}`;

/**
 * Tool definitions exposed to the review agent.
 * The LLM can call these to explore the codebase before producing its final review.
 */
const REVIEW_TOOLS: vscode.LanguageModelChatTool[] = [
  {
    name: 'readFile',
    description:
      'Read the full content of a file in the workspace. Use this to understand code context, follow imports, or verify logic referenced in the diff.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path to the file from the workspace root (e.g. "src/auth.ts")',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'searchCode',
    description:
      'Search for a text or regex pattern across the workspace. Use this to find usages of a function, class, or variable referenced in the diff.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Text or regex pattern to search for',
        },
        include: {
          type: 'string',
          description: 'Optional glob pattern to restrict files, e.g. "**/*.ts"',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'listDirectory',
    description:
      'List files and folders in a directory. Use this to understand project structure or discover related files.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path to the directory (e.g. "src" or "." for root)',
        },
      },
      required: ['path'],
    },
  },
];

/**
 * Builds the full system prompt by combining internal instructions with
 * user-defined instructions from agent-watch-instructions.md.
 *
 * @returns Complete system prompt string
 */
async function buildSystemPrompt(): Promise<string> {
  try {
    const instructions = await loadUserInstructions();
    const userSection = getUserInstructionsText(instructions.rules);
    if (userSection) {
      log(`[ReviewEngine] Loaded ${instructions.rules.length} user-defined rule(s) from agent-watch-instructions.md`);
    }
    return SYSTEM_PROMPT_BASE + userSection;
  } catch {
    return SYSTEM_PROMPT_BASE;
  }
}

/**
 * Configures the review engine.
 *
 * @param config - Configuration options
 */
export function configure(config: {
  maxDiffChars?: number;
  outputChannel?: vscode.OutputChannel;
  modelFamily?: string;
}): void {
  if (config.maxDiffChars !== undefined) maxDiffChars = config.maxDiffChars;
  if (config.outputChannel !== undefined) outputChannel = config.outputChannel;
  if (config.modelFamily !== undefined) modelFamily = config.modelFamily;
}

/**
 * Reviews a single file: gets its diff and history, sends to LLM, returns issues.
 *
 * @param filePath - Relative file path to review
 * @param token - Cancellation token
 * @returns Array of review issues found (empty if file is clean)
 */
export async function reviewFile(
  filePath: string,
  token?: vscode.CancellationToken,
): Promise<ReviewIssue[]> {
  const diff = await getFileDiff(filePath);
  if (!diff) {
    log(`[ReviewEngine] No diff for ${filePath}, skipping.`);
    return [];
  }

  const history = await getRecentHistory(filePath);
  const truncatedDiff = truncateText(diff, maxDiffChars);

  const userPrompt = buildUserPrompt(filePath, truncatedDiff, history);
  log(`[ReviewEngine] Reviewing ${filePath} (${truncatedDiff.length} chars diff)`);

  const issues = await callLLM(userPrompt, token);

  // Ensure all issues have the correct file path
  return issues.map((issue) => ({ ...issue, file: filePath }));
}

/**
 * Reviews multiple files in sequence.
 * Calls the onProgress callback as each file completes.
 *
 * @param filePaths - Array of relative file paths to review
 * @param onProgress - Called after each file with accumulated issues
 * @param token - Cancellation token
 * @returns All review issues found across all files
 */
export async function reviewFiles(
  filePaths: string[],
  onProgress?: (issues: ReviewIssue[], file: string) => void,
  token?: vscode.CancellationToken,
): Promise<ReviewIssue[]> {
  const allIssues: ReviewIssue[] = [];

  for (const filePath of filePaths) {
    if (token?.isCancellationRequested) {
      break;
    }

    try {
      const fileIssues = await reviewFile(filePath, token);
      allIssues.push(...fileIssues);
      onProgress?.(allIssues, filePath);
    } catch (error) {
      log(`[ReviewEngine] Error reviewing ${filePath}: ${error}`);
    }
  }

  return allIssues;
}

/**
 * Builds the user prompt for a single file review.
 */
function buildUserPrompt(filePath: string, diff: string, history: string): string {
  let prompt = `Review this file change for risks that a human developer must verify.\n\n`;
  prompt += `File: ${filePath}\n\n`;

  if (history) {
    prompt += `Recent git history for this file:\n${history}\n\n`;
  }

  prompt += `Diff:\n\`\`\`\n${diff}\n\`\`\`\n\n`;
  prompt += `Respond with a JSON array of issues. If no issues, respond with [].`;

  return prompt;
}

/**
 * Calls the Copilot LLM via vscode.lm API and parses the response.
 *
 * @param userPrompt - The user prompt to send
 * @param token - Cancellation token
 * @returns Parsed array of review issues
 */
async function callLLM(
  userPrompt: string,
  token?: vscode.CancellationToken,
): Promise<ReviewIssue[]> {
  const models = await vscode.lm.selectChatModels({
    vendor: 'copilot',
    family: modelFamily,
  });

  if (models.length === 0) {
    log(`[ReviewEngine] No '${modelFamily}' model available. Trying any Copilot model...`);
    const fallbackModels = await vscode.lm.selectChatModels({ vendor: 'copilot' });
    if (fallbackModels.length === 0) {
      throw new Error('No Copilot models available. Ensure GitHub Copilot is installed and active.');
    }
    log(`[ReviewEngine] Using fallback model: ${fallbackModels[0].family}`);
    return await runAgentLoop(fallbackModels[0], userPrompt, token);
  }

  log(`[ReviewEngine] Using model: ${models[0].family}`);
  return await runAgentLoop(models[0], userPrompt, token);
}

/**
 * Runs the agentic review loop: the model explores the codebase via tools,
 * then finalizes with a JSON response when it has enough context.
 *
 * Each iteration:
 * 1. Send current messages (with tools available) to the model.
 * 2. Stream the response — collect text parts and tool call parts.
 * 3. If the model made tool calls: execute them and add results, then loop.
 * 4. If the model responded with text only: parse JSON and return issues.
 */
async function runAgentLoop(
  model: vscode.LanguageModelChat,
  userPrompt: string,
  token?: vscode.CancellationToken,
): Promise<ReviewIssue[]> {
  const systemPrompt = await buildSystemPrompt();
  const cancelToken = token ?? new vscode.CancellationTokenSource().token;

  const messages: vscode.LanguageModelChatMessage[] = [
    vscode.LanguageModelChatMessage.User(systemPrompt),
    vscode.LanguageModelChatMessage.User(userPrompt),
  ];

  for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration++) {
    if (cancelToken.isCancellationRequested) break;

    const response = await model.sendRequest(messages, { tools: REVIEW_TOOLS }, cancelToken);

    const textParts: vscode.LanguageModelTextPart[] = [];
    const toolCallParts: vscode.LanguageModelToolCallPart[] = [];

    for await (const chunk of response.stream) {
      if (chunk instanceof vscode.LanguageModelTextPart) {
        textParts.push(chunk);
      } else if (chunk instanceof vscode.LanguageModelToolCallPart) {
        toolCallParts.push(chunk);
      }
    }

    // No tool calls → model is done exploring, parse the final JSON response
    if (toolCallParts.length === 0) {
      const fullText = textParts.map((p) => p.value).join('');
      log(`[ReviewEngine] Agent done after ${iteration + 1} iteration(s). Response: ${fullText.length} chars`);
      return parseResponse(fullText);
    }

    log(
      `[ReviewEngine] Agent iteration ${iteration + 1}: called ${toolCallParts.length} tool(s): ` +
      toolCallParts.map((t) => t.name).join(', '),
    );

    // Add assistant message (text + tool calls) to the conversation
    messages.push(vscode.LanguageModelChatMessage.Assistant([...textParts, ...toolCallParts]));

    // Execute each tool and add results back as a User message
    const toolResults: vscode.LanguageModelToolResultPart[] = [];
    for (const toolCall of toolCallParts) {
      const input = toolCall.input as Record<string, string>;
      const result = await executeToolCall(toolCall.name, input);
      log(`[ReviewEngine] Tool '${toolCall.name}' result: ${result.length} chars`);
      toolResults.push(
        new vscode.LanguageModelToolResultPart(toolCall.callId, [
          new vscode.LanguageModelTextPart(result),
        ]),
      );
    }

    messages.push(vscode.LanguageModelChatMessage.User(toolResults));
  }

  log('[ReviewEngine] Agent reached max iterations without finalizing. Returning empty.');
  return [];
}



/**
 * Parses the LLM response text into ReviewIssue objects.
 * Handles common response variations: markdown fences, extra text, etc.
 *
 * @param responseText - Raw response from the LLM
 * @returns Parsed and validated array of ReviewIssue objects
 */
export function parseResponse(responseText: string): ReviewIssue[] {
  let text = responseText.trim();

  // Strip markdown code fences if present
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  // Try to find a JSON array in the text
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (!arrayMatch) {
    log('[ReviewEngine] No JSON array found in response');
    return [];
  }

  try {
    const parsed = JSON.parse(arrayMatch[0]);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter(isValidIssue)
      .map(normalizeIssue);
  } catch (error) {
    log(`[ReviewEngine] Failed to parse JSON: ${error}`);
    return [];
  }
}

/**
 * Validates that a parsed object has the required ReviewIssue fields.
 */
function isValidIssue(obj: unknown): boolean {
  if (typeof obj !== 'object' || obj === null) return false;
  const item = obj as Record<string, unknown>;
  return (
    typeof item.tier === 'string' &&
    ['high', 'medium', 'low'].includes(item.tier) &&
    typeof item.line === 'number' &&
    typeof item.title === 'string' &&
    typeof item.explanation === 'string'
  );
}

/**
 * Normalizes a parsed issue object into a proper ReviewIssue.
 */
function normalizeIssue(obj: Record<string, unknown>): ReviewIssue {
  return {
    tier: obj.tier as RiskTier,
    file: typeof obj.file === 'string' ? obj.file : '',
    line: Math.max(1, Math.round(obj.line as number)),
    title: truncateText(obj.title as string, 80),
    explanation: truncateText(obj.explanation as string, 500),
  };
}

/**
 * Logs a message to the output channel if available.
 */
function log(message: string): void {
  outputChannel?.appendLine(message);
}

/**
 * Resets module state. Used for testing.
 */
export function resetState(): void {
  maxDiffChars = 15_000;
  outputChannel = undefined;
  modelFamily = 'gpt-4o';
}
