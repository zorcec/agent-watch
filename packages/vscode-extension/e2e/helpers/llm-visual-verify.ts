/**
 * LLM Visual Verification Helper
 *
 * Sends screenshots or diagram JSON to the VS Code Skills Proxy
 * (OpenAI-compatible API) for semantic verification of diagram content.
 * Rate-limited to MAX_LLM_CALLS per test suite run.
 */

const DEFAULT_MODEL = process.env.LLM_MODEL ?? 'gpt-4o';
const SKILLS_PROXY_URL =
  process.env.SKILLS_PROXY_URL ?? 'http://127.0.0.1:18080';
const MAX_LLM_CALLS = 5;
let llmCallCount = 0;

export function isLLMTestEnabled(): boolean {
  return process.env.RUN_LLM_TESTS === 'true';
}

export function remainingLLMCalls(): number {
  return MAX_LLM_CALLS - llmCallCount;
}

export function resetLLMCallCount(): void {
  llmCallCount = 0;
}

/**
 * Sends a screenshot to the LLM for yes/no verification.
 * Consumes one LLM call from the budget.
 */
export async function verifyScreenshotWithLLM(
  screenshotBuffer: Buffer,
  verificationPrompt: string,
): Promise<{ answer: string; passed: boolean }> {
  if (llmCallCount >= MAX_LLM_CALLS) {
    throw new Error(`LLM call budget exhausted (${MAX_LLM_CALLS} calls used)`);
  }
  llmCallCount++;

  const base64 = screenshotBuffer.toString('base64');

  const response = await fetch(`${SKILLS_PROXY_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are a visual verification assistant. You receive a screenshot of a diagram editor and a question. Answer ONLY with "YES" or "NO" followed by a brief explanation (max 20 words).',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: verificationPrompt },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${base64}` },
            },
          ],
        },
      ],
      max_tokens: 50,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Skills proxy returned ${response.status}: ${await response.text()}`,
    );
  }

  const result = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const answer = result.choices?.[0]?.message?.content?.trim() ?? '';
  const passed = answer.toUpperCase().startsWith('YES');

  return { answer, passed };
}

/**
 * Text-only LLM verification: verifies diagram JSON structure.
 * Fallback when vision (multimodal) is not available.
 */
export async function verifyDiagramStructureWithLLM(
  diagramJson: string,
  verificationPrompt: string,
): Promise<{ answer: string; passed: boolean }> {
  if (llmCallCount >= MAX_LLM_CALLS) {
    throw new Error(`LLM call budget exhausted (${MAX_LLM_CALLS} calls used)`);
  }
  llmCallCount++;

  const response = await fetch(`${SKILLS_PROXY_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are a diagram structure verifier. You receive a JSON diagram document and a question. Answer ONLY "YES" or "NO" followed by a brief explanation (max 20 words).',
        },
        {
          role: 'user',
          content: `Diagram JSON:\n${diagramJson}\n\nQuestion: ${verificationPrompt}`,
        },
      ],
      max_tokens: 50,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Skills proxy returned ${response.status}: ${await response.text()}`,
    );
  }

  const result = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const answer = result.choices?.[0]?.message?.content?.trim() ?? '';
  const passed = answer.toUpperCase().startsWith('YES');

  return { answer, passed };
}
