/**
 * Module: fileWatcher.ts
 *
 * Description:
 *   Watches for file changes from two complementary sources:
 *
 *   1. vscode.workspace.onDidSaveTextDocument  — fires when a file is saved
 *      through VS Code's own editor (Ctrl+S, auto-save, etc.). This is the
 *      primary source for in-editor developer saves.
 *
 *   2. vscode.workspace.createFileSystemWatcher — fires when any process writes
 *      to the filesystem directly (AI agent CLI tools, shell scripts, etc.).
 *      VS Code's FileSystemWatcher does NOT reliably fire for files saved from
 *      within VS Code's own editor, so source (1) is still required.
 *
 *   Both sources feed through the same per-file debounce (DEBOUNCE_MS) so that
 *   if both happen to fire for the same save event, only one callback is issued.
 *
 *   Also implements heuristic arming: if 3+ distinct files change within
 *   10 seconds, AgentWatch auto-arms assuming an AI agent is at work.
 *
 * Usage:
 *   import { startWatching, stopWatching, configure } from './fileWatcher';
 *   startWatching(onFileReady);
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { shouldReviewFile } from '../utils';

/** Milliseconds to wait after the last event for a file before forwarding */
const DEBOUNCE_MS = 300;

/** Recent change timestamps for heuristic arming (one entry per file event) */
const recentSaves: number[] = [];

/** Per-file debounce timers, keyed by workspace-relative file path */
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Heuristic arming config */
let heuristicThreshold = 3;
let heuristicWindowMs = 10_000;

/** Callbacks */
let onFileReadyCallback: ((filePath: string) => void) | undefined;
let onHeuristicArmCallback: (() => void) | undefined;

/** Combined disposable returned from startWatching */
let watcherDisposable: vscode.Disposable | undefined;

/**
 * Configures the file watcher heuristic parameters.
 *
 * @param config - Configuration options
 */
export function configure(config: {
  heuristicThreshold?: number;
  heuristicWindowMs?: number;
}): void {
  if (config.heuristicThreshold !== undefined) heuristicThreshold = config.heuristicThreshold;
  if (config.heuristicWindowMs !== undefined) heuristicWindowMs = config.heuristicWindowMs;
}

/**
 * Starts watching for file changes from both the VS Code editor and external
 * processes. Calls onFileReady when a reviewable file changes.
 * Calls onHeuristicArm when rapid multi-file changes are detected.
 *
 * @param onFileReady - Called with workspace-relative path when a file changes
 * @param onHeuristicArm - Called when the heuristic detects agent activity
 * @returns Disposable to stop watching
 */
export function startWatching(
  onFileReady: (filePath: string) => void,
  onHeuristicArm?: () => void,
): vscode.Disposable {
  onFileReadyCallback = onFileReady;
  onHeuristicArmCallback = onHeuristicArm;

  // Source 1: editor saves (Ctrl+S, auto-save, etc.)
  const saveDisposable = vscode.workspace.onDidSaveTextDocument((document) => {
    scheduleHandle(document.uri);
  });

  // Source 2: external filesystem writes (AI agents, shell scripts, etc.)
  const fsWatcher = vscode.workspace.createFileSystemWatcher('**/*');
  const changeDisposable = fsWatcher.onDidChange((uri) => scheduleHandle(uri));
  const createDisposable = fsWatcher.onDidCreate((uri) => scheduleHandle(uri));

  watcherDisposable = {
    dispose: () => {
      saveDisposable.dispose();
      changeDisposable.dispose();
      createDisposable.dispose();
      fsWatcher.dispose();
    },
  };

  return watcherDisposable;
}

/**
 * Stops watching for file changes.
 */
export function stopWatching(): void {
  watcherDisposable?.dispose();
  watcherDisposable = undefined;
  onFileReadyCallback = undefined;
  onHeuristicArmCallback = undefined;
  clearAllDebounceTimers();
}

/**
 * Debounces events per file.
 * Collapses rapid successive events (e.g., the editor and filesystem watcher
 * both firing for the same save) into a single handleChange call.
 */
function scheduleHandle(uri: vscode.Uri): void {
  const filePath = resolveRelativePath(uri);
  if (!filePath) return;
  if (!shouldReviewFile(filePath)) return;

  const existing = debounceTimers.get(filePath);
  if (existing) clearTimeout(existing);

  debounceTimers.set(
    filePath,
    setTimeout(() => {
      debounceTimers.delete(filePath);
      handleChange(filePath);
    }, DEBOUNCE_MS),
  );
}

/**
 * Handles a debounced file-change event.
 * Forwards the file path to the review callback and tracks it for heuristic arming.
 */
function handleChange(filePath: string): void {
  trackSaveForHeuristic();
  onFileReadyCallback?.(filePath);
}

/**
 * Converts a file URI to a workspace-relative path.
 *
 * Uses `vscode.workspace.getWorkspaceFolder(uri)` to correctly resolve the file's
 * owning workspace folder in both single-root and multi-root workspaces.
 * Returns undefined if the file is outside any workspace folder.
 *
 * Using path.relative (not asRelativePath) avoids the multi-root prefix behaviour
 * where asRelativePath would yield "folderName/src/auth.ts" instead of "src/auth.ts".
 */
function resolveRelativePath(uri: vscode.Uri): string | undefined {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (!folder) return undefined;

  const relative = path.relative(folder.uri.fsPath, uri.fsPath);

  // Reject paths that escape the workspace folder (e.g. "../../outside")
  if (relative.startsWith('..') || path.isAbsolute(relative)) return undefined;

  return relative;
}

/**
 * Tracks file change timestamps for heuristic arming detection.
 * If changes reach the threshold within the window, triggers heuristic arm.
 */
function trackSaveForHeuristic(): void {
  const now = Date.now();
  recentSaves.push(now);

  const cutoff = now - heuristicWindowMs;
  while (recentSaves.length > 0 && recentSaves[0] < cutoff) {
    recentSaves.shift();
  }

  if (recentSaves.length >= heuristicThreshold && onHeuristicArmCallback) {
    onHeuristicArmCallback();
    recentSaves.length = 0;
  }
}

/**
 * Clears all pending debounce timers.
 */
function clearAllDebounceTimers(): void {
  for (const timer of debounceTimers.values()) {
    clearTimeout(timer);
  }
  debounceTimers.clear();
}

/**
 * Resets module state. Used for testing.
 */
export function resetState(): void {
  stopWatching();
  recentSaves.length = 0;
  heuristicThreshold = 3;
  heuristicWindowMs = 10_000;
}
