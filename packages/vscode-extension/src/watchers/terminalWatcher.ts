/**
 * Module: terminalWatcher.ts
 *
 * Description:
 *   Monitors integrated terminal activity in VS Code for agent start/end patterns.
 *   Uses the stable shell integration API (onDidStartTerminalShellExecution,
 *   onDidEndTerminalShellExecution) to detect command patterns.
 *   Ships with built-in patterns for Claude Code, Cursor, Aider, and Copilot Edits.
 *   Supports adding custom patterns via configuration.
 *
 * Usage:
 *   import { startTerminalWatching, stopTerminalWatching } from './terminalWatcher';
 *   startTerminalWatching({ onAgentStart: () => {}, onAgentEnd: () => {} });
 */

import * as vscode from 'vscode';
import type { AgentPattern } from '../types';

/** Built-in agent detection patterns (matched against command line text) */
const DEFAULT_PATTERNS: AgentPattern[] = [
  {
    name: 'Claude Code',
    startPattern: /claude|anthropic.*code/i,
    endPattern: /claude|anthropic.*code/i,
  },
  {
    name: 'Aider',
    startPattern: /aider\s/i,
    endPattern: /aider\s/i,
  },
  {
    name: 'Cursor Agent',
    startPattern: /cursor.*agent|composer/i,
    endPattern: /cursor.*agent|composer/i,
  },
  {
    name: 'Copilot Edits',
    startPattern: /copilot.*edit/i,
    endPattern: /copilot.*edit/i,
  },
];

/** Custom patterns added via configuration */
let customPatterns: AgentPattern[] = [];

/** Callbacks */
let onAgentStartCallback: (() => void) | undefined;
let onAgentEndCallback: (() => void) | undefined;

/** Whether an agent is currently detected as running */
let agentDetected = false;

/** VS Code disposables for terminal listeners */
let startDisposable: vscode.Disposable | undefined;
let endDisposable: vscode.Disposable | undefined;

/**
 * Adds custom agent detection patterns.
 *
 * @param patterns - Array of custom patterns to add
 */
export function addPatterns(patterns: AgentPattern[]): void {
  customPatterns.push(...patterns);
}

/**
 * Returns all active patterns (built-in + custom).
 */
export function getActivePatterns(): AgentPattern[] {
  return [...DEFAULT_PATTERNS, ...customPatterns];
}

/**
 * Returns whether an agent is currently detected as running.
 */
export function isAgentRunning(): boolean {
  return agentDetected;
}

/**
 * Starts monitoring terminal shell execution for agent patterns.
 *
 * @param callbacks - onAgentStart and onAgentEnd callbacks
 * @returns Disposable to stop watching
 */
export function startTerminalWatching(callbacks: {
  onAgentStart: () => void;
  onAgentEnd: () => void;
}): vscode.Disposable {
  onAgentStartCallback = callbacks.onAgentStart;
  onAgentEndCallback = callbacks.onAgentEnd;

  startDisposable = vscode.window.onDidStartTerminalShellExecution((event) => {
    const commandLine = event.execution.commandLine.value;
    handleTerminalData(commandLine);
  });

  endDisposable = vscode.window.onDidEndTerminalShellExecution(() => {
    if (agentDetected) {
      agentDetected = false;
      onAgentEndCallback?.();
    }
  });

  return {
    dispose: () => {
      startDisposable?.dispose();
      endDisposable?.dispose();
    },
  };
}

/**
 * Stops monitoring terminal output.
 */
export function stopTerminalWatching(): void {
  startDisposable?.dispose();
  endDisposable?.dispose();
  startDisposable = undefined;
  endDisposable = undefined;
  onAgentStartCallback = undefined;
  onAgentEndCallback = undefined;
}

/**
 * Processes a command line string and checks for agent start patterns.
 * Exported for testing.
 *
 * @param data - Command line text
 */
export function handleTerminalData(data: string): void {
  const allPatterns = getActivePatterns();

  if (!agentDetected) {
    for (const pattern of allPatterns) {
      if (pattern.startPattern.test(data)) {
        agentDetected = true;
        onAgentStartCallback?.();
        return;
      }
    }
  }
}

/**
 * Resets module state. Used for testing.
 */
export function resetState(): void {
  stopTerminalWatching();
  customPatterns = [];
  agentDetected = false;
}
