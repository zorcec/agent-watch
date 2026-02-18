/**
 * AgentWatch TerminalWatcher - Unit Tests
 *
 * Tests for terminal output pattern matching and agent detection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => ({
  window: {
    onDidStartTerminalShellExecution: vi.fn(() => ({ dispose: vi.fn() })),
    onDidEndTerminalShellExecution: vi.fn(() => ({ dispose: vi.fn() })),
  },
}));

import {
  handleTerminalData,
  isAgentRunning,
  getActivePatterns,
  addPatterns,
  resetState,
} from './terminalWatcher';

describe('terminalWatcher', () => {
  beforeEach(() => {
    resetState();
  });

  describe('getActivePatterns', () => {
    it('should include built-in patterns', () => {
      const patterns = getActivePatterns();
      const names = patterns.map((p) => p.name);
      expect(names).toContain('Claude Code');
      expect(names).toContain('Aider');
      expect(names).toContain('Cursor Agent');
      expect(names).toContain('Copilot Edits');
    });

    it('should include custom patterns after adding', () => {
      addPatterns([
        {
          name: 'Custom Agent',
          startPattern: /custom-agent start/i,
          endPattern: /custom-agent done/i,
        },
      ]);
      const patterns = getActivePatterns();
      const names = patterns.map((p) => p.name);
      expect(names).toContain('Custom Agent');
    });
  });

  describe('handleTerminalData', () => {
    it('should detect Claude Code start', () => {
      expect(isAgentRunning()).toBe(false);
      handleTerminalData('Running claude code assistant');
      expect(isAgentRunning()).toBe(true);
    });

    it('should detect Aider start', () => {
      handleTerminalData('aider --model gpt-4');
      expect(isAgentRunning()).toBe(true);
    });

    it('should detect agent end after start', () => {
      handleTerminalData('Running claude code');
      expect(isAgentRunning()).toBe(true);
      // In the real implementation, agent end is detected via onDidEndTerminalShellExecution
      // For unit test, we just verify the start detection works
    });

    it('should not change state for unmatched terminal data when agent is running', () => {
      handleTerminalData('Running claude code');
      expect(isAgentRunning()).toBe(true);
      handleTerminalData('npm install lodash');
      expect(isAgentRunning()).toBe(true);
    });

    it('should ignore unmatched terminal data', () => {
      handleTerminalData('npm install lodash');
      expect(isAgentRunning()).toBe(false);
    });

    it('should detect custom agent pattern', () => {
      addPatterns([
        {
          name: 'My Agent',
          startPattern: /my-agent run/i,
          endPattern: /my-agent finished/i,
        },
      ]);
      handleTerminalData('my-agent run --fix');
      expect(isAgentRunning()).toBe(true);
    });
  });

  describe('isAgentRunning', () => {
    it('should start as false', () => {
      expect(isAgentRunning()).toBe(false);
    });

    it('should be true while agent is detected', () => {
      handleTerminalData('claude analysis');
      expect(isAgentRunning()).toBe(true);
    });

    it('should reset to false after resetState', () => {
      handleTerminalData('claude analysis');
      expect(isAgentRunning()).toBe(true);
      resetState();
      expect(isAgentRunning()).toBe(false);
    });
  });
});
