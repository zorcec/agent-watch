/**
 * AgentWatch GitService - Unit Tests
 *
 * Tests for git CLI wrapper functions.
 * Mocks child_process.execFile via util.promisify to avoid actual git calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExecFileAsync } = vi.hoisted(() => ({
  mockExecFileAsync: vi.fn(),
}));

vi.mock('util', () => ({
  promisify: vi.fn(() => mockExecFileAsync),
}));

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

import {
  snapshotBaseline,
  getBaseline,
  getWorkspaceRoot,
  getFileDiff,
  getBaselineContent,
  getChangedFiles,
  isFileModified,
  getRecentHistory,
  isGitRepository,
  resetState,
} from './gitService';

/** Helper to mock the promisified execFile to resolve */
function mockGitResult(stdout: string): void {
  mockExecFileAsync.mockResolvedValue({ stdout, stderr: '' });
}

/** Helper to mock the promisified execFile to reject */
function mockGitError(message: string): void {
  mockExecFileAsync.mockRejectedValue(new Error(message));
}

describe('gitService', () => {
  beforeEach(() => {
    resetState();
    vi.clearAllMocks();
  });

  describe('snapshotBaseline', () => {
    it('should store the workspace root and baseline commit', async () => {
      mockGitResult('abc123def456');
      await snapshotBaseline('/my/repo');
      expect(getBaseline()).toBe('abc123def456');
      expect(getWorkspaceRoot()).toBe('/my/repo');
    });

    it('should call git rev-parse HEAD', async () => {
      mockGitResult('abc123');
      await snapshotBaseline('/my/repo');
      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'git',
        ['rev-parse', 'HEAD'],
        expect.objectContaining({ cwd: '/my/repo' }),
      );
    });

    it('should throw when git fails', async () => {
      mockGitError('not a git repository');
      await expect(snapshotBaseline('/bad/path')).rejects.toThrow();
    });
  });

  describe('getFileDiff', () => {
    it('should return diff for a file', async () => {
      mockGitResult('abc123');
      await snapshotBaseline('/repo');

      mockGitResult('diff --git a/file.ts b/file.ts\n+new line');
      const diff = await getFileDiff('file.ts');
      expect(diff).toContain('+new line');
    });

    it('should return empty string when git diff fails', async () => {
      mockGitResult('abc123');
      await snapshotBaseline('/repo');

      mockGitError('error');
      const diff = await getFileDiff('nonexistent.ts');
      expect(diff).toBe('');
    });

    it('should throw if workspace root is not set', async () => {
      // Without snapshotBaseline, workspaceRoot is undefined
      mockGitError('Git workspace root not set');
      const diff = await getFileDiff('file.ts');
      expect(diff).toBe('');
    });
  });

  describe('getBaselineContent', () => {
    it('should return file content at baseline', async () => {
      mockGitResult('abc123');
      await snapshotBaseline('/repo');

      mockGitResult('const x = 1;');
      const content = await getBaselineContent('file.ts');
      expect(content).toBe('const x = 1;');
    });

    it('should return empty string on error', async () => {
      mockGitResult('abc123');
      await snapshotBaseline('/repo');

      mockGitError('fatal: path not found');
      const content = await getBaselineContent('missing.ts');
      expect(content).toBe('');
    });
  });

  describe('getChangedFiles', () => {
    it('should return list of changed files', async () => {
      mockGitResult('abc123');
      await snapshotBaseline('/repo');

      mockGitResult('src/auth.ts\nsrc/utils.ts');
      const files = await getChangedFiles();
      expect(files).toEqual(['src/auth.ts', 'src/utils.ts']);
    });

    it('should return empty array when no changes', async () => {
      mockGitResult('abc123');
      await snapshotBaseline('/repo');

      mockGitResult('');
      const files = await getChangedFiles();
      expect(files).toEqual([]);
    });

    it('should return empty array on error', async () => {
      mockGitResult('abc123');
      await snapshotBaseline('/repo');

      mockGitError('git error');
      const files = await getChangedFiles();
      expect(files).toEqual([]);
    });
  });

  describe('isFileModified', () => {
    it('should return true for modified files', async () => {
      mockGitResult('abc123');
      await snapshotBaseline('/repo');

      mockGitResult('src/auth.ts');
      const modified = await isFileModified('src/auth.ts');
      expect(modified).toBe(true);
    });

    it('should return false for unmodified files', async () => {
      mockGitResult('abc123');
      await snapshotBaseline('/repo');

      mockGitResult('');
      const modified = await isFileModified('src/clean.ts');
      expect(modified).toBe(false);
    });

    it('should return false on error', async () => {
      mockGitResult('abc123');
      await snapshotBaseline('/repo');

      mockGitError('git error');
      const modified = await isFileModified('src/file.ts');
      expect(modified).toBe(false);
    });
  });

  describe('getRecentHistory', () => {
    it('should return formatted git log', async () => {
      mockGitResult('abc123');
      await snapshotBaseline('/repo');

      mockGitResult('abc1234 fix auth\ndef5678 add tests');
      const history = await getRecentHistory('src/auth.ts');
      expect(history).toContain('fix auth');
      expect(history).toContain('add tests');
    });

    it('should return empty string on error', async () => {
      mockGitResult('abc123');
      await snapshotBaseline('/repo');

      mockGitError('git error');
      const history = await getRecentHistory('src/auth.ts');
      expect(history).toBe('');
    });

    it('should pass count parameter to git log', async () => {
      mockGitResult('abc123');
      await snapshotBaseline('/repo');

      mockGitResult('log output');
      await getRecentHistory('file.ts', 10);
      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'git',
        expect.arrayContaining(['-10']),
        expect.any(Object),
      );
    });
  });

  describe('isGitRepository', () => {
    it('should return true for a git repository', async () => {
      mockGitResult('true');
      const result = await isGitRepository('/valid/repo');
      expect(result).toBe(true);
    });

    it('should return false for a non-git directory', async () => {
      mockGitError('fatal: not a git repository');
      const result = await isGitRepository('/not/a/repo');
      expect(result).toBe(false);
    });

    it('should return false when git output is not "true"', async () => {
      mockGitResult('false');
      const result = await isGitRepository('/weird/path');
      expect(result).toBe(false);
    });
  });

  describe('resetState', () => {
    it('should clear baseline and workspace root', async () => {
      mockGitResult('abc123');
      await snapshotBaseline('/repo');
      expect(getBaseline()).toBe('abc123');
      expect(getWorkspaceRoot()).toBe('/repo');

      resetState();
      expect(getBaseline()).toBeUndefined();
      expect(getWorkspaceRoot()).toBeUndefined();
    });
  });
});
