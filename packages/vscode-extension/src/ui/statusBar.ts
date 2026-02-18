/**
 * Module: statusBar.ts
 *
 * Description:
 *   Manages the AgentWatch status bar item in VS Code.
 *   Implements a state machine that transitions between:
 *   idle → watching → reviewing → issues/clean → idle.
 *   Shows issue count, animated spinner during review, and fades
 *   the "clean" state after 5 seconds.
 *
 * Usage:
 *   import { createStatusBar, setState, setIssueCount } from './statusBar';
 *   const disposable = createStatusBar();
 *   setState('watching');
 */

import * as vscode from 'vscode';
import type { AgentState } from '../types';

/** The VS Code status bar item */
let statusBarItem: vscode.StatusBarItem | undefined;

/** Current state */
let currentState: AgentState = 'idle';

/** Timer for auto-fading the clean state */
let cleanFadeTimer: ReturnType<typeof setTimeout> | undefined;

/** Current issue count */
let issueCount = 0;

/** Remaining seconds in the pre-review countdown (undefined = not counting down) */
let countdownSeconds: number | undefined;

/**
 * Creates and shows the status bar item.
 *
 * @returns Disposable to clean up the status bar item
 */
export function createStatusBar(): vscode.Disposable {
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  updateDisplay();
  statusBarItem.show();
  return statusBarItem;
}

/**
 * Returns the current agent state.
 */
export function getState(): AgentState {
  return currentState;
}

/**
 * Sets the agent state and updates the status bar display.
 *
 * @param state - New agent state
 */
export function setState(state: AgentState): void {
  currentState = state;
  countdownSeconds = undefined;

  if (cleanFadeTimer) {
    clearTimeout(cleanFadeTimer);
    cleanFadeTimer = undefined;
  }

  if (state === 'clean') {
    cleanFadeTimer = setTimeout(() => {
      currentState = 'idle';
      updateDisplay();
    }, 5_000);
  }

  updateDisplay();
}

/**
 * Shows the countdown (in seconds) to the next review in the status bar.
 * Only visible while in the 'watching' state.
 * Pass undefined to clear the countdown.
 *
 * @param seconds - Remaining seconds, or undefined to clear
 */
export function setCountdown(seconds: number | undefined): void {
  countdownSeconds = seconds;
  updateDisplay();
}

/**
 * Updates the issue count and switches to 'issues' state if count > 0.
 *
 * @param count - Number of issues found
 */
export function setIssueCount(count: number): void {
  issueCount = count;
  if (count > 0 && currentState !== 'idle') {
    currentState = 'issues';
  }
  updateDisplay();
}

/**
 * Updates the status bar item text, tooltip, and command based on current state.
 */
function updateDisplay(): void {
  if (!statusBarItem) return;

  switch (currentState) {
    case 'idle':
      statusBarItem.text = '$(eye-closed) AgentWatch';
      statusBarItem.tooltip = 'Click to arm AgentWatch';
      statusBarItem.command = 'agentWatch.arm';
      statusBarItem.backgroundColor = undefined;
      break;

    case 'watching':
      if (countdownSeconds !== undefined) {
        statusBarItem.text = `$(clock) Review in ${countdownSeconds}s`;
        statusBarItem.tooltip = `AgentWatch: changes detected — review starts in ${countdownSeconds}s`;
      } else {
        statusBarItem.text = '$(eye) Watching…';
        statusBarItem.tooltip = 'AgentWatch is armed and monitoring file changes';
      }
      statusBarItem.command = 'agentWatch.disarm';
      statusBarItem.backgroundColor = undefined;
      break;

    case 'reviewing':
      statusBarItem.text = '$(sync~spin) Reviewing…';
      statusBarItem.tooltip = 'AgentWatch is reviewing changed files';
      statusBarItem.command = undefined;
      statusBarItem.backgroundColor = undefined;
      break;

    case 'issues':
      statusBarItem.text = `$(warning) ${issueCount} issue${issueCount === 1 ? '' : 's'}`;
      statusBarItem.tooltip = `AgentWatch found ${issueCount} issue${issueCount === 1 ? '' : 's'} — click to view`;
      statusBarItem.command = 'workbench.actions.view.problems';
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      break;

    case 'clean':
      statusBarItem.text = '$(check) Clean';
      statusBarItem.tooltip = 'AgentWatch review complete — no issues found';
      statusBarItem.command = 'agentWatch.arm';
      statusBarItem.backgroundColor = undefined;
      break;
  }
}

/**
 * Resets module state. Used for testing.
 */
export function resetState(): void {
  if (cleanFadeTimer) {
    clearTimeout(cleanFadeTimer);
    cleanFadeTimer = undefined;
  }
  currentState = 'idle';
  issueCount = 0;
  countdownSeconds = undefined;
  statusBarItem = undefined;
}
