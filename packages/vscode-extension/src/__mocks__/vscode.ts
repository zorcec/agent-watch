import { vi } from 'vitest';

export class Uri {
  readonly scheme: string;
  readonly authority: string;
  readonly path: string;
  readonly query: string;
  readonly fragment: string;
  readonly fsPath: string;

  private constructor(scheme: string, path: string) {
    this.scheme = scheme;
    this.authority = '';
    this.path = path;
    this.query = '';
    this.fragment = '';
    this.fsPath = path;
  }

  static file(path: string): Uri {
    return new Uri('file', path);
  }

  static joinPath(base: Uri, ...segments: string[]): Uri {
    return new Uri(base.scheme, [base.path, ...segments].join('/'));
  }

  toString(): string {
    return `${this.scheme}://${this.path}`;
  }
}

export class Range {
  constructor(
    public readonly startLine: number,
    public readonly startCharacter: number,
    public readonly endLine: number,
    public readonly endCharacter: number,
  ) {}
}

export class Position {
  constructor(
    public readonly line: number,
    public readonly character: number,
  ) {}
}

export class WorkspaceEdit {
  private edits: { uri: Uri; range: Range; newText: string }[] = [];

  replace(uri: Uri, range: Range, newText: string): void {
    this.edits.push({ uri, range, newText });
  }

  getEdits() {
    return this.edits;
  }
}

export class MarkdownString {
  constructor(public readonly value: string) {}
}

export class LanguageModelToolResult {
  constructor(public readonly parts: LanguageModelTextPart[]) {}
}

export class LanguageModelTextPart {
  constructor(public readonly value: string) {}
}

export const workspace = {
  applyEdit: vi.fn().mockResolvedValue(true),
  onDidChangeTextDocument: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  openTextDocument: vi.fn().mockResolvedValue({ getText: vi.fn().mockReturnValue('{}') }),
  workspaceFolders: [],
  textDocuments: [] as any[],
  fs: {
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(new Uint8Array()),
  },
};

export const window = {
  registerCustomEditorProvider: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  showSaveDialog: vi.fn(),
  showOpenDialog: vi.fn(),
  showInformationMessage: vi.fn(),
  showErrorMessage: vi.fn(),
};

export const commands = {
  registerCommand: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  executeCommand: vi.fn().mockResolvedValue(undefined),
};

export const lm = {
  registerTool: vi.fn().mockReturnValue({ dispose: vi.fn() }),
};

export class CancellationTokenSource {
  token = { isCancellationRequested: false, onCancellationRequested: vi.fn() };
  cancel = vi.fn();
  dispose = vi.fn();
}
