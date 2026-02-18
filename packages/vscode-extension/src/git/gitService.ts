/**
 * Module: gitService.ts
 *
 * Description:
 *   Thin wrapper around git CLI calls for AgentWatch.
 *   Provides functions to snapshot baseline state, get per-file diffs,
 *   retrieve recent file history, and list changed files since baseline.
 *   All git operations are spawned as child processes.
 *
 * Usage:
 *   import { snapshotBaseline, getFileDiff, getChangedFiles, getRecentHistory } from './gitService';
 *   await snapshotBaseline('/path/to/repo');
 *   const diff = await getFileDiff('/path/to/repo', 'src/auth.ts');
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/** Stored baseline commit SHA */
let baselineCommit: string | undefined;

/** Stored workspace root for git operations */
let workspaceRoot: string | undefined;

/**
 * Executes a git command in the workspace root.
 *
 * @param args - Arguments to pass to git
 * @returns stdout from the git command
 * @throws Error if git command fails or workspace root is not set
 */
async function runGit(args: string[]): Promise<string> {
  if (!workspaceRoot) {
    throw new Error('Git workspace root not set. Call snapshotBaseline first.');
  }
  const { stdout } = await execFileAsync('git', args, {
    cwd: workspaceRoot,
    maxBuffer: 1024 * 1024 * 10,
  });
  return stdout.trim();
}

/**
 * Snapshots the current HEAD as the baseline for diff comparison.
 * Should be called when the developer arms AgentWatch or when an agent is detected starting.
 *
 * @param rootPath - Workspace root path (must be a git repository)
 * @throws Error if not a git repository
 */
export async function snapshotBaseline(rootPath: string): Promise<void> {
  workspaceRoot = rootPath;
  baselineCommit = await runGit(['rev-parse', 'HEAD']);
}

/**
 * Returns the current baseline commit SHA.
 */
export function getBaseline(): string | undefined {
  return baselineCommit;
}

/**
 * Returns the configured workspace root.
 */
export function getWorkspaceRoot(): string | undefined {
  return workspaceRoot;
}

/**
 * Gets the diff for a single file relative to the baseline.
 * Returns the unified diff output, or empty string if no changes.
 *
 * @param filePath - Relative file path from workspace root
 * @returns Unified diff string
 */
export async function getFileDiff(filePath: string): Promise<string> {
  try {
    const ref = baselineCommit ?? 'HEAD';
    return await runGit(['diff', ref, '--', filePath]);
  } catch {
    return '';
  }
}

/**
 * Gets the full content of a file at the baseline (or HEAD) commit.
 *
 * @param filePath - Relative file path from workspace root
 * @returns File content at baseline, or empty string if file didn't exist
 */
export async function getBaselineContent(filePath: string): Promise<string> {
  try {
    const ref = baselineCommit ?? 'HEAD';
    return await runGit(['show', `${ref}:${filePath}`]);
  } catch {
    return '';
  }
}

/**
 * Lists all files that have been modified since the baseline.
 *
 * @returns Array of relative file paths that have changes
 */
export async function getChangedFiles(): Promise<string[]> {
  try {
    const ref = baselineCommit ?? 'HEAD';
    const output = await runGit(['diff', '--name-only', ref]);
    if (!output) {
      return [];
    }
    return output.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Checks if a specific file has been modified since the baseline.
 *
 * @param filePath - Relative file path to check
 * @returns true if the file has changes
 */
export async function isFileModified(filePath: string): Promise<boolean> {
  try {
    const ref = baselineCommit ?? 'HEAD';
    const output = await runGit(['diff', '--name-only', ref, '--', filePath]);
    return output.length > 0;
  } catch {
    return false;
  }
}

/**
 * Gets recent git log entries for a specific file.
 * Provides context about the file's history for the LLM prompt.
 *
 * @param filePath - Relative file path
 * @param count - Number of log entries to retrieve (default: 5)
 * @returns Formatted git log string
 */
export async function getRecentHistory(filePath: string, count = 5): Promise<string> {
  try {
    return await runGit([
      'log',
      '--oneline',
      `-${count}`,
      '--',
      filePath,
    ]);
  } catch {
    return '';
  }
}

/**
 * Checks whether the workspace root is a valid git repository.
 *
 * @param rootPath - Path to check
 * @returns true if the path is inside a git repository
 */
export async function isGitRepository(rootPath: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: rootPath,
    });
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

/**
 * Resets module state. Used for testing.
 */
export function resetState(): void {
  baselineCommit = undefined;
  workspaceRoot = undefined;
}
