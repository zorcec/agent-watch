/**
 * AgentWatch SurfaceManager - Unit Tests
 *
 * Tests for diagnostic collection, issue tracking, and CodeLens/Hover providers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => {
  const mockDiagnosticCollection = {
    set: vi.fn(),
    clear: vi.fn(),
    dispose: vi.fn(),
  };

  const mockDecorationType = {
    dispose: vi.fn(),
  };

  return {
    languages: {
      createDiagnosticCollection: vi.fn(() => mockDiagnosticCollection),
      registerCodeLensProvider: vi.fn(() => ({ dispose: vi.fn() })),
      registerHoverProvider: vi.fn(() => ({ dispose: vi.fn() })),
    },
    window: {
      createTextEditorDecorationType: vi.fn(() => mockDecorationType),
      onDidChangeActiveTextEditor: vi.fn(() => ({ dispose: vi.fn() })),
      visibleTextEditors: [],
    },
    workspace: {
      workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
      asRelativePath: vi.fn((uri: any) => uri?.fsPath ?? uri),
    },
    DiagnosticSeverity: {
      Error: 0,
      Warning: 1,
      Information: 2,
      Hint: 3,
    },
    OverviewRulerLane: {
      Left: 1,
      Center: 2,
      Right: 4,
    },
    ThemeColor: vi.fn((id: string) => ({ id })),
    Range: vi.fn((sl: number, sc: number, el: number, ec: number) => ({
      start: { line: sl, character: sc },
      end: { line: el, character: ec },
    })),
    Diagnostic: vi.fn().mockImplementation(function (this: any, range: any, message: string, severity: number) {
      this.range = range;
      this.message = message;
      this.severity = severity;
      this.source = '';
    }),
    MarkdownString: vi.fn().mockImplementation(function (this: any) {
      this.value = '';
      this.isTrusted = false;
      this.appendMarkdown = function (text: string) { this.value += text; };
    }),
    CodeLens: vi.fn((range: any, command: any) => ({ range, command })),
    Hover: vi.fn((contents: any) => ({ contents })),
    Uri: {
      joinPath: vi.fn((_base: any, path: string) => ({ fsPath: `/workspace/${path}` })),
    },
  };
});

import {
  initSurfaces,
  updateIssues,
  addFileIssues,
  getAllIssues,
  getIssueCount,
  clearAll,
  resetState,
} from './surfaceManager';
import type { ReviewIssue } from '../types';

const createIssue = (overrides: Partial<ReviewIssue> = {}): ReviewIssue => ({
  tier: 'medium',
  file: 'src/auth.ts',
  line: 10,
  title: 'Test issue',
  explanation: 'Test explanation',
  ...overrides,
});

describe('surfaceManager', () => {
  beforeEach(() => {
    resetState();
  });

  describe('initSurfaces', () => {
    it('should return an array of disposables', () => {
      const disposables = initSurfaces();
      expect(disposables).toBeDefined();
      expect(Array.isArray(disposables)).toBe(true);
      expect(disposables.length).toBeGreaterThan(0);
    });

    it('should create a diagnostic collection', async () => {
      const vscode = await import('vscode');
      initSurfaces();
      expect(vscode.languages.createDiagnosticCollection).toHaveBeenCalledWith('agentwatch');
    });

    it('should register a CodeLens provider', async () => {
      const vscode = await import('vscode');
      initSurfaces();
      expect(vscode.languages.registerCodeLensProvider).toHaveBeenCalled();
    });

    it('should register a Hover provider', async () => {
      const vscode = await import('vscode');
      initSurfaces();
      expect(vscode.languages.registerHoverProvider).toHaveBeenCalled();
    });
  });

  describe('updateIssues', () => {
    it('should store issues and update count', () => {
      initSurfaces();
      updateIssues([createIssue(), createIssue({ line: 20 })]);
      expect(getIssueCount()).toBe(2);
    });

    it('should replace previous issues completely', () => {
      initSurfaces();
      updateIssues([createIssue(), createIssue({ line: 20 }), createIssue({ line: 30 })]);
      expect(getIssueCount()).toBe(3);

      updateIssues([createIssue()]);
      expect(getIssueCount()).toBe(1);
    });

    it('should group issues by file', () => {
      initSurfaces();
      updateIssues([
        createIssue({ file: 'a.ts', line: 1 }),
        createIssue({ file: 'a.ts', line: 2 }),
        createIssue({ file: 'b.ts', line: 1 }),
      ]);
      expect(getIssueCount()).toBe(3);

      const all = getAllIssues();
      const filesA = all.filter((i) => i.file === 'a.ts');
      const filesB = all.filter((i) => i.file === 'b.ts');
      expect(filesA).toHaveLength(2);
      expect(filesB).toHaveLength(1);
    });
  });

  describe('addFileIssues', () => {
    it('should add issues for a specific file without clearing others', () => {
      initSurfaces();
      updateIssues([createIssue({ file: 'a.ts' })]);
      addFileIssues('b.ts', [createIssue({ file: 'b.ts' })]);
      expect(getIssueCount()).toBe(2);
    });

    it('should replace issues for the same file', () => {
      initSurfaces();
      addFileIssues('a.ts', [createIssue({ file: 'a.ts', line: 1 }), createIssue({ file: 'a.ts', line: 2 })]);
      expect(getIssueCount()).toBe(2);

      addFileIssues('a.ts', [createIssue({ file: 'a.ts', line: 5 })]);
      expect(getIssueCount()).toBe(1);
    });
  });

  describe('getAllIssues', () => {
    it('should return empty array when no issues', () => {
      expect(getAllIssues()).toEqual([]);
    });

    it('should return all issues from all files', () => {
      initSurfaces();
      updateIssues([
        createIssue({ file: 'a.ts' }),
        createIssue({ file: 'b.ts' }),
      ]);
      expect(getAllIssues()).toHaveLength(2);
    });
  });

  describe('getIssueCount', () => {
    it('should return 0 when no issues', () => {
      expect(getIssueCount()).toBe(0);
    });

    it('should return total count across all files', () => {
      initSurfaces();
      updateIssues([
        createIssue({ file: 'a.ts' }),
        createIssue({ file: 'b.ts' }),
        createIssue({ file: 'b.ts', line: 20 }),
      ]);
      expect(getIssueCount()).toBe(3);
    });
  });

  describe('clearAll', () => {
    it('should remove all issues', () => {
      initSurfaces();
      updateIssues([createIssue(), createIssue({ line: 20 })]);
      expect(getIssueCount()).toBe(2);

      clearAll();
      expect(getIssueCount()).toBe(0);
      expect(getAllIssues()).toEqual([]);
    });

    it('should not throw when called without initialization', () => {
      expect(() => clearAll()).not.toThrow();
    });
  });

  describe('resetState', () => {
    it('should clear all internal state', () => {
      initSurfaces();
      updateIssues([createIssue()]);
      resetState();
      expect(getIssueCount()).toBe(0);
    });
  });
});
