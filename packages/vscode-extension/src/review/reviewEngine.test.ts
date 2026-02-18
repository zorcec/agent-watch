/**
 * AgentWatch ReviewEngine - Unit Tests
 *
 * Tests for prompt building, response parsing, issue validation, and the
 * agentic review loop (model calls tools → gets results → finalizes with JSON).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Hoist mock classes so they are available when vi.mock factories run
 * (vi.mock is hoisted above all other statements by Vitest).
 */
const { MockTextPart, MockToolCallPart } = vi.hoisted(() => {
  class MockTextPart {
    constructor(public value: string) {}
  }

  class MockToolCallPart {
    constructor(
      public name: string,
      public callId: string,
      public input: Record<string, string>,
    ) {}
  }

  return { MockTextPart, MockToolCallPart };
});

vi.mock('vscode', () => ({
  lm: { selectChatModels: vi.fn(async () => []) },
  CancellationTokenSource: vi.fn(() => ({ token: { isCancellationRequested: false }, cancel: vi.fn(), dispose: vi.fn() })),
  LanguageModelChatMessage: {
    User: vi.fn((content: any) => ({ role: 'user', content })),
    Assistant: vi.fn((content: any) => ({ role: 'assistant', content })),
  },
  LanguageModelTextPart: MockTextPart,
  LanguageModelToolCallPart: MockToolCallPart,
  LanguageModelToolResultPart: vi.fn((callId: string, content: any) => ({ callId, content })),
}));

// Mock workspaceTools so we control tool execution in agent loop tests
vi.mock('./workspaceTools', () => ({
  executeToolCall: vi.fn(async () => 'export function login() {}'),
}));

import { parseResponse, reviewFile, resetState } from './reviewEngine';
import * as vscode from 'vscode';
import { executeToolCall } from './workspaceTools';

// Also mock gitService so reviewFile has a diff to work with
vi.mock('../git/gitService', () => ({
  getFileDiff: vi.fn(async () => '@@ -1,3 +1,4 @@\n function login() {\n+  skipAuth();\n }'),
  getRecentHistory: vi.fn(async () => 'abc123 fix auth'),
}));

vi.mock('../instructions/instructionsLoader', () => ({
  loadUserInstructions: vi.fn(async () => ({ found: false, rules: [], rawContent: '', config: {} })),
  getUserInstructionsText: vi.fn(() => ''),
}));

describe('parseResponse', () => {
  it('should parse a valid JSON array of issues', () => {
    const response = JSON.stringify([
      {
        tier: 'high',
        file: 'src/auth.ts',
        line: 47,
        title: 'Token used without validation',
        explanation: 'The auth token from the request header is used directly without validation.',
      },
    ]);

    const issues = parseResponse(response);
    expect(issues).toHaveLength(1);
    expect(issues[0].tier).toBe('high');
    expect(issues[0].file).toBe('src/auth.ts');
    expect(issues[0].line).toBe(47);
    expect(issues[0].title).toBe('Token used without validation');
  });

  it('should return empty array for empty JSON array', () => {
    const issues = parseResponse('[]');
    expect(issues).toHaveLength(0);
  });

  it('should handle markdown code fences around JSON', () => {
    const response = '```json\n[{"tier":"medium","file":"api.ts","line":10,"title":"Sig changed","explanation":"Function signature changed."}]\n```';
    const issues = parseResponse(response);
    expect(issues).toHaveLength(1);
    expect(issues[0].tier).toBe('medium');
  });

  it('should handle code fences without language tag', () => {
    const response = '```\n[{"tier":"low","file":"utils.ts","line":5,"title":"Renamed var","explanation":"Variable renamed."}]\n```';
    const issues = parseResponse(response);
    expect(issues).toHaveLength(1);
  });

  it('should extract JSON array from surrounding text', () => {
    const response = 'Here are the issues:\n[{"tier":"high","file":"a.ts","line":1,"title":"Bug","explanation":"Desc"}]\nEnd.';
    const issues = parseResponse(response);
    expect(issues).toHaveLength(1);
  });

  it('should return empty array for non-JSON response', () => {
    const issues = parseResponse('No issues found in this file.');
    expect(issues).toHaveLength(0);
  });

  it('should return empty array for invalid JSON', () => {
    const issues = parseResponse('[{invalid json}]');
    expect(issues).toHaveLength(0);
  });

  it('should filter out items with invalid tier', () => {
    const response = JSON.stringify([
      { tier: 'critical', file: 'a.ts', line: 1, title: 'Bad', explanation: 'Desc' },
      { tier: 'high', file: 'b.ts', line: 2, title: 'Good', explanation: 'Desc' },
    ]);
    const issues = parseResponse(response);
    expect(issues).toHaveLength(1);
    expect(issues[0].tier).toBe('high');
  });

  it('should filter out items missing required fields', () => {
    const response = JSON.stringify([
      { tier: 'high', file: 'a.ts', line: 1 }, // missing title and explanation
      { tier: 'high', file: 'b.ts', line: 2, title: 'Valid', explanation: 'Desc' },
    ]);
    const issues = parseResponse(response);
    expect(issues).toHaveLength(1);
  });

  it('should normalize line numbers to at least 1', () => {
    const response = JSON.stringify([
      { tier: 'low', file: 'a.ts', line: 0, title: 'Zero line', explanation: 'Desc' },
      { tier: 'low', file: 'b.ts', line: -5, title: 'Negative line', explanation: 'Desc' },
    ]);
    const issues = parseResponse(response);
    expect(issues).toHaveLength(2);
    expect(issues[0].line).toBe(1);
    expect(issues[1].line).toBe(1);
  });

  it('should truncate long titles to 80 characters', () => {
    const longTitle = 'A'.repeat(120);
    const response = JSON.stringify([
      { tier: 'medium', file: 'a.ts', line: 1, title: longTitle, explanation: 'Desc' },
    ]);
    const issues = parseResponse(response);
    expect(issues[0].title.length).toBeLessThanOrEqual(80);
  });

  it('should handle multiple issues', () => {
    const response = JSON.stringify([
      { tier: 'high', file: 'a.ts', line: 10, title: 'Issue 1', explanation: 'Desc 1' },
      { tier: 'medium', file: 'b.ts', line: 20, title: 'Issue 2', explanation: 'Desc 2' },
      { tier: 'low', file: 'c.ts', line: 30, title: 'Issue 3', explanation: 'Desc 3' },
    ]);
    const issues = parseResponse(response);
    expect(issues).toHaveLength(3);
  });

  it('should handle empty string input', () => {
    const issues = parseResponse('');
    expect(issues).toHaveLength(0);
  });

  it('should handle whitespace-only input', () => {
    const issues = parseResponse('   \n\n  ');
    expect(issues).toHaveLength(0);
  });
});

describe('reviewFile — agentic loop', () => {
  beforeEach(() => {
    resetState();
    vi.clearAllMocks();
  });

  /**
   * Creates a mock LanguageModelChat whose sendRequest returns a stream
   * of chunks built from the provided sequences. Each call to sendRequest
   * consumes the next sequence in `responses`.
   */
  function makeMockModel(responses: object[][]): any {
    let callIndex = 0;
    return {
      sendRequest: vi.fn(async () => {
        const chunks = responses[callIndex] ?? [];
        callIndex++;
        return {
          stream: (async function* () {
            for (const chunk of chunks) {
              yield chunk;
            }
          })(),
        };
      }),
    };
  }

  it('should return issues when model responds with JSON directly (no tool calls)', async () => {
    const jsonResponse = JSON.stringify([
      { tier: 'high', file: 'src/auth.ts', line: 3, title: 'Skipped auth', explanation: 'skipAuth() bypasses validation' },
    ]);
    const model = makeMockModel([[new MockTextPart(jsonResponse)]]);
    (vscode.lm.selectChatModels as any).mockResolvedValue([model]);

    const issues = await reviewFile('src/auth.ts');
    expect(issues).toHaveLength(1);
    expect(issues[0].tier).toBe('high');
    expect(issues[0].title).toBe('Skipped auth');
  });

  it('should call a tool and use the result in the next iteration', async () => {
    const jsonResponse = JSON.stringify([
      { tier: 'medium', file: 'src/auth.ts', line: 1, title: 'Login call suspicious', explanation: 'login() called without guard' },
    ]);

    // Iteration 1: model calls readFile tool
    // Iteration 2: model finalizes with JSON
    const model = makeMockModel([
      [new MockToolCallPart('readFile', 'call-001', { path: 'src/utils.ts' })],
      [new MockTextPart(jsonResponse)],
    ]);
    (vscode.lm.selectChatModels as any).mockResolvedValue([model]);
    (executeToolCall as any).mockResolvedValue('export function login() {}');

    const issues = await reviewFile('src/auth.ts');

    expect(executeToolCall).toHaveBeenCalledWith('readFile', { path: 'src/utils.ts' });
    expect(issues).toHaveLength(1);
    expect(model.sendRequest).toHaveBeenCalledTimes(2);
  });

  it('should return empty array if model never finalizes within MAX_ITERATIONS', async () => {
    // Model always returns a tool call, never finalizes
    const infiniteToolCall = [new MockToolCallPart('listDirectory', 'call-x', { path: '.' })];
    const responses = Array(11).fill(infiniteToolCall);
    const model = makeMockModel(responses);
    (vscode.lm.selectChatModels as any).mockResolvedValue([model]);
    (executeToolCall as any).mockResolvedValue('src/\npackage.json');

    const issues = await reviewFile('src/auth.ts');
    expect(issues).toHaveLength(0);
  });

  it('should return empty array when no model is available', async () => {
    (vscode.lm.selectChatModels as any).mockResolvedValue([]);

    await expect(reviewFile('src/auth.ts')).rejects.toThrow('No Copilot models available');
  });

  it('should return empty array when file has no diff', async () => {
    const { getFileDiff } = await import('../git/gitService');
    (getFileDiff as any).mockResolvedValueOnce('');

    const issues = await reviewFile('src/unchanged.ts');
    expect(issues).toHaveLength(0);
  });
});
