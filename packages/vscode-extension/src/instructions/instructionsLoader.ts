/**
 * Module: instructionsLoader.ts
 *
 * Description:
 *   Loads and parses user-defined review instructions from `agent-watch-instructions.md`
 *   in the workspace root. These instructions are merged with the internal risk taxonomy
 *   to form the complete review prompt.
 *
 *   Supported file format:
 *   - Optional YAML front matter (between `---` delimiters) for configuration:
 *       model: claude-3-5-sonnet  (model family to use for reviews)
 *       minWaitTimeMs: 15000      (minimum ms between review batch dispatches)
 *   - Markdown section headers (ignored)
 *   - List items with optional severity tags: [high], [medium], [low]
 *   - Blockquote lines (starting with >) are treated as comments and ignored
 *
 * Usage:
 *   import { loadUserInstructions, getUserInstructionsText } from './instructionsLoader';
 *   const instructions = await loadUserInstructions();
 *   const promptSection = getUserInstructionsText(instructions.rules);
 */

import * as vscode from 'vscode';
import type { RiskTier } from '../types';

/** Default filename for user instructions */
const INSTRUCTIONS_FILENAME = 'agent-watch-instructions.md';

/**
 * A single user-defined validation rule parsed from the instructions file.
 */
export type UserRule = {
  /** Severity level for this rule */
  severity: RiskTier;
  /** The rule text describing what to validate */
  text: string;
};

/**
 * Configuration parsed from the YAML front matter of the instructions file.
 */
export type InstructionsConfig = {
  /** Model family to use for reviews (e.g. "claude-3-5-sonnet", "gpt-4o") */
  model?: string;
  /** Minimum milliseconds to wait between review batch dispatches */
  minWaitTimeMs?: number;
};

/**
 * Result of loading user instructions.
 */
export type UserInstructions = {
  /** Whether the instructions file was found */
  found: boolean;
  /** Parsed validation rules */
  rules: UserRule[];
  /** Raw file content (for debugging) */
  rawContent: string;
  /** Configuration values from the YAML front matter */
  config: InstructionsConfig;
};

/**
 * Loads user-defined instructions from `agent-watch-instructions.md` in the workspace root.
 * Returns empty rules if the file doesn't exist or is empty.
 *
 * @param rootPath - Absolute path to the workspace folder root (from resolveWorkspaceRootPath).
 *   When provided, the file is loaded from this path instead of workspaceFolders[0],
 *   which is necessary for correct behaviour in multi-root workspaces.
 * @returns Parsed user instructions including config from YAML front matter
 */
export async function loadUserInstructions(rootPath?: string): Promise<UserInstructions> {
  const fileUri = resolveInstructionsUri(rootPath);
  if (!fileUri) {
    return { found: false, rules: [], rawContent: '', config: {} };
  }

  try {
    const content = await readFileContent(fileUri);
    if (!content.trim()) {
      return { found: true, rules: [], rawContent: '', config: {} };
    }

    const { body, config } = extractFrontMatter(content);
    const rules = parseInstructions(body);
    return { found: true, rules, rawContent: content, config };
  } catch {
    return { found: false, rules: [], rawContent: '', config: {} };
  }
}

/**
 * Builds a prompt section from user-defined rules.
 * Returns an empty string if there are no rules.
 *
 * @param rules - Parsed user rules
 * @returns Prompt text to append to the system prompt
 */
export function getUserInstructionsText(rules: UserRule[]): string {
  if (rules.length === 0) return '';

  const lines = rules.map((rule) => {
    const tierLabel = rule.severity === 'high' ? 'HIGH' : rule.severity === 'medium' ? 'MEDIUM' : 'LOW';
    return `- [${tierLabel}] ${rule.text}`;
  });

  return `\nAdditional project-specific validation rules (from agent-watch-instructions.md):\n${lines.join('\n')}`;
}

/**
 * Extracts YAML front matter from markdown content.
 * Front matter is delimited by `---` on its own line at the start of the file.
 *
 * @param content - Raw file content
 * @returns Parsed config and the body without front matter
 */
export function extractFrontMatter(content: string): { body: string; config: InstructionsConfig } {
  const frontMatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!frontMatterMatch) {
    return { body: content, config: {} };
  }

  const yamlBlock = frontMatterMatch[1];
  const body = frontMatterMatch[2] ?? '';
  const config = parseYamlBlock(yamlBlock);
  return { body, config };
}

/**
 * Parses a minimal YAML block (key: value pairs only) into an InstructionsConfig.
 * Does not support nested objects, arrays, or quoted strings with colons.
 */
function parseYamlBlock(yaml: string): InstructionsConfig {
  const config: InstructionsConfig = {};

  for (const rawLine of yaml.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();

    if (key === 'model' && value) {
      config.model = value;
    } else if (key === 'minWaitTimeMs' && value) {
      const parsed = Number(value);
      if (!Number.isNaN(parsed) && parsed >= 0) {
        config.minWaitTimeMs = parsed;
      }
    }
  }

  return config;
}

/**
 * Parses the markdown body of the instructions file into UserRule objects.
 *
 * Supported formats:
 *   - `[high] Always flag changes to payment processing code`
 *   - `[medium] Watch for changes to database migration files`
 *   - `[low] Note any changes to README files`
 *   - `Flag removed error handlers` (defaults to medium)
 *
 * Lines starting with `#` are treated as section headers and ignored.
 * Empty lines and lines starting with `>` (blockquotes / comments) are ignored.
 *
 * @param content - Markdown content (without front matter)
 * @returns Array of parsed rules
 */
export function parseInstructions(content: string): UserRule[] {
  const rules: UserRule[] = [];

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#') || line.startsWith('>')) {
      continue;
    }

    // Strip leading list markers: -, *, or numbered (1.)
    const stripped = line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '');
    if (!stripped) continue;

    const { severity, text } = extractSeverity(stripped);
    if (text) {
      rules.push({ severity, text });
    }
  }

  return rules;
}

/**
 * Extracts severity tag and rule text from a single line.
 * Supports tags like [high], [medium], [low] at the start of the line.
 * Defaults to 'medium' if no tag is found.
 */
function extractSeverity(line: string): { severity: RiskTier; text: string } {
  const tagMatch = line.match(/^\[(high|medium|low)\]\s*/i);
  if (tagMatch) {
    const severity = tagMatch[1].toLowerCase() as RiskTier;
    const text = line.slice(tagMatch[0].length).trim();
    return { severity, text };
  }
  return { severity: 'medium', text: line };
}

/**
 * Resolves the URI of the instructions file.
 *
 * When rootPath is given (multi-root workspace), constructs the URI directly from that
 * path so we always look in the correct project folder — not blindly in workspaceFolders[0].
 */
function resolveInstructionsUri(rootPath?: string): vscode.Uri | undefined {
  if (rootPath) {
    return vscode.Uri.joinPath(vscode.Uri.file(rootPath), INSTRUCTIONS_FILENAME);
  }
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return undefined;
  return vscode.Uri.joinPath(folders[0].uri, INSTRUCTIONS_FILENAME);
}

/**
 * Reads the content of a file by URI.
 */
async function readFileContent(uri: vscode.Uri): Promise<string> {
  const bytes = await vscode.workspace.fs.readFile(uri);
  return Buffer.from(bytes).toString('utf-8');
}
