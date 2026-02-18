/**
 * AgentWatch WorkspaceTools - Unit Tests
 *
 * Tests for the codebase exploration tools available to the review agent:
 * readFile, searchCode, listDirectory, and executeToolCall dispatch.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
    asRelativePath: vi.fn((uri: any) => {
      const path = typeof uri === 'string' ? uri : uri?.fsPath ?? '';
      return path.replace('/workspace/', '');
    }),
    fs: {
      readFile: vi.fn(),
      readDirectory: vi.fn(),
    },
    findFiles: vi.fn(),
  },
  Uri: {
    joinPath: vi.fn((_base: any, path: string) => ({ fsPath: `/workspace/${path}` })),
  },
  FileType: {
    Unknown: 0,
    File: 1,
    Directory: 2,
    SymbolicLink: 64,
  },
}));

import { executeToolCall, readFile, searchCode, listDirectory } from './workspaceTools';
import * as vscode from 'vscode';

describe('readFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
  });

  it('should return file content', async () => {
    (vscode.workspace.fs.readFile as any).mockResolvedValue(Buffer.from('const x = 1;'));
    const result = await readFile('src/auth.ts');
    expect(result).toBe('const x = 1;');
  });

  it('should return error when no workspace is open', async () => {
    (vscode.workspace as any).workspaceFolders = undefined;
    const result = await readFile('src/auth.ts');
    expect(result).toContain('Error');
  });

  it('should return error when path is empty', async () => {
    const result = await readFile('');
    expect(result).toContain('Error');
  });

  it('should return error message when file read fails', async () => {
    (vscode.workspace.fs.readFile as any).mockRejectedValue(new Error('File not found'));
    const result = await readFile('nonexistent.ts');
    expect(result).toContain('Error reading');
  });

  it('should truncate files over MAX_FILE_READ_CHARS', async () => {
    const largeContent = 'x'.repeat(35_000);
    (vscode.workspace.fs.readFile as any).mockResolvedValue(Buffer.from(largeContent));
    const result = await readFile('big.ts');
    expect(result.length).toBeLessThan(35_000);
    expect(result).toContain('truncated');
  });
});

describe('searchCode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
  });

  it('should return error when query is empty', async () => {
    const result = await searchCode('');
    expect(result).toContain('Error');
  });

  it('should return no-matches message when nothing found', async () => {
    (vscode.workspace.findFiles as any).mockResolvedValue([]);
    const result = await searchCode('nonExistentPattern');
    expect(result).toContain('No matches found');
  });

  it('should find matching lines in files', async () => {
    const fileUri = { fsPath: '/workspace/src/auth.ts' };
    (vscode.workspace.findFiles as any).mockResolvedValue([fileUri]);
    (vscode.workspace.fs.readFile as any).mockResolvedValue(
      Buffer.from('const token = getToken();\nconsole.log(token);'),
    );

    const result = await searchCode('getToken');
    expect(result).toContain('getToken');
    expect(result).toContain(':1:');
  });

  it('should handle invalid regex by treating as plain text', async () => {
    (vscode.workspace.findFiles as any).mockResolvedValue([]);
    // This should not throw even with invalid regex chars
    const result = await searchCode('(invalid[regex');
    expect(result).toContain('No matches found');
  });

  it('should search multiple files and aggregate results', async () => {
    const fileA = { fsPath: '/workspace/src/a.ts' };
    const fileB = { fsPath: '/workspace/src/b.ts' };
    (vscode.workspace.findFiles as any).mockResolvedValue([fileA, fileB]);
    (vscode.workspace.fs.readFile as any)
      .mockResolvedValueOnce(Buffer.from('function login() {}'))
      .mockResolvedValueOnce(Buffer.from('function logout() {}\nlogin();'));

    const result = await searchCode('login');
    expect(result).toContain('a.ts');
    expect(result).toContain('b.ts');
  });

  it('should include match count in output', async () => {
    const fileUri = { fsPath: '/workspace/src/auth.ts' };
    (vscode.workspace.findFiles as any).mockResolvedValue([fileUri]);
    (vscode.workspace.fs.readFile as any).mockResolvedValue(
      Buffer.from('authCheck();\nauthCheck();'),
    );

    const result = await searchCode('authCheck');
    expect(result).toMatch(/Found \d+ match/);
  });
});

describe('listDirectory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
  });

  it('should list files and directories', async () => {
    (vscode.workspace.fs.readDirectory as any).mockResolvedValue([
      ['src', vscode.FileType.Directory],
      ['package.json', vscode.FileType.File],
      ['README.md', vscode.FileType.File],
    ]);

    const result = await listDirectory('.');
    expect(result).toContain('src/');
    expect(result).toContain('package.json');
    expect(result).toContain('README.md');
  });

  it('should suffix directories with /', async () => {
    (vscode.workspace.fs.readDirectory as any).mockResolvedValue([
      ['components', vscode.FileType.Directory],
    ]);

    const result = await listDirectory('src');
    expect(result).toContain('components/');
  });

  it('should return error when no workspace is open', async () => {
    (vscode.workspace as any).workspaceFolders = undefined;
    const result = await listDirectory('.');
    expect(result).toContain('Error');
  });

  it('should return error when directory read fails', async () => {
    (vscode.workspace.fs.readDirectory as any).mockRejectedValue(new Error('ENOENT'));
    const result = await listDirectory('nonexistent');
    expect(result).toContain('Error listing');
  });

  it('should include path in the output header', async () => {
    (vscode.workspace.fs.readDirectory as any).mockResolvedValue([
      ['index.ts', vscode.FileType.File],
    ]);

    const result = await listDirectory('src/auth');
    expect(result).toContain("src/auth");
  });
});

describe('executeToolCall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
  });

  it('should dispatch readFile tool', async () => {
    (vscode.workspace.fs.readFile as any).mockResolvedValue(Buffer.from('file content'));
    const result = await executeToolCall('readFile', { path: 'src/auth.ts' });
    expect(result).toBe('file content');
  });

  it('should dispatch searchCode tool', async () => {
    (vscode.workspace.findFiles as any).mockResolvedValue([]);
    const result = await executeToolCall('searchCode', { query: 'findMe' });
    expect(result).toContain('No matches found');
  });

  it('should dispatch listDirectory tool', async () => {
    (vscode.workspace.fs.readDirectory as any).mockResolvedValue([
      ['index.ts', vscode.FileType.File],
    ]);
    const result = await executeToolCall('listDirectory', { path: 'src' });
    expect(result).toContain('index.ts');
  });

  it('should return error for unknown tool', async () => {
    const result = await executeToolCall('unknownTool', {});
    expect(result).toContain('Unknown tool');
  });

  it('should handle missing input gracefully', async () => {
    (vscode.workspace.fs.readFile as any).mockResolvedValue(Buffer.from('ok'));
    // path is empty string when not provided
    const result = await executeToolCall('readFile', {});
    expect(result).toContain('Error'); // missing path
  });
});
