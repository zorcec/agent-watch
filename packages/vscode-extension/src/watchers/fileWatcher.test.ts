/**
 * AgentWatch FileWatcher - Unit Tests
 *
 * Tests file-change forwarding from both event sources:
 *   1. onDidSaveTextDocument  — editor saves (Ctrl+S, auto-save)
 *   2. createFileSystemWatcher — external filesystem writes (AI agents, shells)
 *
 * The debounce naturally deduplicates events when both sources fire for the
 * same save (a single callback is issued after DEBOUNCE_MS of quiet time).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/** Captured handlers */
let onSaveDocFn: ((doc: any) => void) | undefined;
let onChangeFn: ((uri: any) => void) | undefined;
let onCreateFn: ((uri: any) => void) | undefined;

function createMockWatcher() {
  return {
    onDidChange: vi.fn((handler: (uri: any) => void) => {
      onChangeFn = handler;
      return { dispose: vi.fn() };
    }),
    onDidCreate: vi.fn((handler: (uri: any) => void) => {
      onCreateFn = handler;
      return { dispose: vi.fn() };
    }),
    dispose: vi.fn(),
  };
}

vi.mock('vscode', () => ({
  workspace: {
    onDidSaveTextDocument: vi.fn((handler: (doc: any) => void) => {
      onSaveDocFn = handler;
      return { dispose: vi.fn() };
    }),
    createFileSystemWatcher: vi.fn(() => createMockWatcher()),
    getWorkspaceFolder: vi.fn((uri: any) => {
      // Return the mock workspace folder for any URI under /workspace/
      if (uri?.fsPath?.startsWith('/workspace')) {
        return { uri: { fsPath: '/workspace' } };
      }
      return undefined;
    }),
  },
}));

vi.mock('../utils', () => ({
  shouldReviewFile: vi.fn(() => true),
}));

import {
  startWatching,
  stopWatching,
  configure,
  resetState,
} from './fileWatcher';
import { shouldReviewFile } from '../utils';
import * as vscode from 'vscode';

/** Simulate an editor save (onDidSaveTextDocument) */
function simulateEditorSave(absolutePath: string): void {
  onSaveDocFn?.({ uri: { fsPath: absolutePath } });
}

/** Simulate an external filesystem change (FileSystemWatcher.onDidChange) */
function simulateExternalChange(absolutePath: string): void {
  onChangeFn?.({ fsPath: absolutePath });
}

/** Simulate an external file creation (FileSystemWatcher.onDidCreate) */
function simulateExternalCreate(absolutePath: string): void {
  onCreateFn?.({ fsPath: absolutePath });
}

describe('fileWatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    onSaveDocFn = undefined;
    onChangeFn = undefined;
    onCreateFn = undefined;
    resetState();
    vi.clearAllMocks();
    (shouldReviewFile as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (vscode.workspace.onDidSaveTextDocument as ReturnType<typeof vi.fn>).mockImplementation(
      (handler: (doc: any) => void) => {
        onSaveDocFn = handler;
        return { dispose: vi.fn() };
      },
    );
    (vscode.workspace.createFileSystemWatcher as ReturnType<typeof vi.fn>).mockImplementation(
      () => createMockWatcher(),
    );
    (vscode.workspace.getWorkspaceFolder as ReturnType<typeof vi.fn>).mockImplementation(
      (uri: any) => (uri?.fsPath?.startsWith('/workspace') ? { uri: { fsPath: '/workspace' } } : undefined),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('startWatching', () => {
    it('should register both an editor save listener and a filesystem watcher', () => {
      startWatching(vi.fn());
      expect(vscode.workspace.onDidSaveTextDocument).toHaveBeenCalledOnce();
      expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledWith('**/*');
    });

    it('should capture all three event handlers', () => {
      startWatching(vi.fn());
      expect(onSaveDocFn).toBeDefined();
      expect(onChangeFn).toBeDefined();
      expect(onCreateFn).toBeDefined();
    });

    it('should return a disposable', () => {
      const disposable = startWatching(vi.fn());
      expect(disposable.dispose).toBeDefined();
    });
  });

  describe('stopWatching', () => {
    it('should not throw when called without starting', () => {
      expect(() => stopWatching()).not.toThrow();
    });
  });

  describe('configure', () => {
    it('should accept heuristic configuration without throwing', () => {
      expect(() =>
        configure({ heuristicThreshold: 5, heuristicWindowMs: 20_000 }),
      ).not.toThrow();
    });
  });

  describe('editor save detection (onDidSaveTextDocument)', () => {
    it('should call onFileReady after debounce when an editor save occurs', async () => {
      const onFileReady = vi.fn();
      startWatching(onFileReady);

      simulateEditorSave('/workspace/src/auth.ts');
      expect(onFileReady).not.toHaveBeenCalled(); // debounce pending

      await vi.advanceTimersByTimeAsync(300);
      expect(onFileReady).toHaveBeenCalledWith('src/auth.ts');
    });

    it('should deliver each distinct editor save after debounce', async () => {
      const onFileReady = vi.fn();
      startWatching(onFileReady);

      simulateEditorSave('/workspace/src/auth.ts');
      await vi.advanceTimersByTimeAsync(300);
      expect(onFileReady).toHaveBeenCalledTimes(1);

      simulateEditorSave('/workspace/src/auth.ts');
      await vi.advanceTimersByTimeAsync(300);
      expect(onFileReady).toHaveBeenCalledTimes(2);
    });
  });

  describe('external write detection (createFileSystemWatcher)', () => {
    it('should call onFileReady after debounce when a file changes externally', async () => {
      const onFileReady = vi.fn();
      startWatching(onFileReady);

      simulateExternalChange('/workspace/src/auth.ts');
      await vi.advanceTimersByTimeAsync(300);

      expect(onFileReady).toHaveBeenCalledWith('src/auth.ts');
    });

    it('should call onFileReady after debounce when a file is created externally', async () => {
      const onFileReady = vi.fn();
      startWatching(onFileReady);

      simulateExternalCreate('/workspace/src/newFile.ts');
      await vi.advanceTimersByTimeAsync(300);

      expect(onFileReady).toHaveBeenCalledWith('src/newFile.ts');
    });
  });

  describe('deduplication: both sources fire for the same save', () => {
    it('should emit only one callback when both editor save and fs watcher fire', async () => {
      const onFileReady = vi.fn();
      startWatching(onFileReady);

      // Both sources fire almost simultaneously for the same file
      simulateEditorSave('/workspace/src/auth.ts');
      simulateExternalChange('/workspace/src/auth.ts');

      await vi.advanceTimersByTimeAsync(300);
      expect(onFileReady).toHaveBeenCalledTimes(1);
      expect(onFileReady).toHaveBeenCalledWith('src/auth.ts');
    });
  });

  describe('debouncing', () => {
    it('should debounce rapid events for the same file into a single call', async () => {
      const onFileReady = vi.fn();
      startWatching(onFileReady);

      simulateEditorSave('/workspace/src/auth.ts');
      simulateEditorSave('/workspace/src/auth.ts');
      simulateEditorSave('/workspace/src/auth.ts');

      await vi.advanceTimersByTimeAsync(300);
      expect(onFileReady).toHaveBeenCalledTimes(1);
    });

    it('should forward multiple different files independently', async () => {
      const onFileReady = vi.fn();
      startWatching(onFileReady);

      simulateEditorSave('/workspace/src/a.ts');
      simulateExternalChange('/workspace/src/b.ts');

      await vi.advanceTimersByTimeAsync(300);
      expect(onFileReady).toHaveBeenCalledTimes(2);
    });
  });

  describe('path resolution', () => {
    it('should compute path relative to workspace root without folder prefix', async () => {
      const onFileReady = vi.fn();
      startWatching(onFileReady);

      simulateEditorSave('/workspace/src/components/Button.tsx');
      await vi.advanceTimersByTimeAsync(300);

      expect(onFileReady).toHaveBeenCalledWith('src/components/Button.tsx');
    });

    it('should reject files outside the workspace', async () => {
      const onFileReady = vi.fn();
      startWatching(onFileReady);

      simulateExternalChange('/outside/somefile.ts');
      await vi.advanceTimersByTimeAsync(300);

      expect(onFileReady).not.toHaveBeenCalled();
    });

    it('should skip files that shouldReviewFile rejects', async () => {
      (shouldReviewFile as ReturnType<typeof vi.fn>).mockReturnValue(false);
      const onFileReady = vi.fn();
      startWatching(onFileReady);

      simulateEditorSave('/workspace/node_modules/pkg/index.js');
      await vi.advanceTimersByTimeAsync(300);

      expect(onFileReady).not.toHaveBeenCalled();
    });
  });

  describe('heuristic arming', () => {
    it('should trigger heuristic arm after threshold file changes in window', async () => {
      const onFileReady = vi.fn();
      const onHeuristicArm = vi.fn();
      startWatching(onFileReady, onHeuristicArm);

      simulateEditorSave('/workspace/src/a.ts');
      simulateEditorSave('/workspace/src/b.ts');
      await vi.advanceTimersByTimeAsync(300);
      expect(onHeuristicArm).not.toHaveBeenCalled();

      simulateEditorSave('/workspace/src/c.ts');
      await vi.advanceTimersByTimeAsync(300);
      expect(onHeuristicArm).toHaveBeenCalledTimes(1);
    });

    it('should trigger heuristic arm from a mix of editor and external saves', async () => {
      const onHeuristicArm = vi.fn();
      startWatching(vi.fn(), onHeuristicArm);

      simulateEditorSave('/workspace/src/a.ts');
      simulateExternalChange('/workspace/src/b.ts');
      await vi.advanceTimersByTimeAsync(300);

      simulateEditorSave('/workspace/src/c.ts');
      await vi.advanceTimersByTimeAsync(300);
      expect(onHeuristicArm).toHaveBeenCalledTimes(1);
    });

    it('should not trigger heuristic arm if saves are outside window', async () => {
      configure({ heuristicWindowMs: 1_000, heuristicThreshold: 3 });
      const onHeuristicArm = vi.fn();
      startWatching(vi.fn(), onHeuristicArm);

      simulateEditorSave('/workspace/src/a.ts');
      simulateEditorSave('/workspace/src/b.ts');
      await vi.advanceTimersByTimeAsync(1_500); // past the window

      simulateEditorSave('/workspace/src/c.ts');
      await vi.advanceTimersByTimeAsync(300);

      expect(onHeuristicArm).not.toHaveBeenCalled();
    });
  });

  describe('resetState', () => {
    it('should clear all state without throwing', () => {
      startWatching(vi.fn());
      expect(() => resetState()).not.toThrow();
    });
  });
});
