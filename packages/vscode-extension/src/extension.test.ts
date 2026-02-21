import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => import('./__mocks__/vscode'));
vi.mock('./DiagramEditorProvider', () => ({
  DiagramEditorProvider: {
    register: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  },
}));
vi.mock('./DiagramService', () => ({
  DiagramService: vi.fn().mockImplementation(() => ({
    setActiveDocument: vi.fn(),
    getActiveDocument: vi.fn(),
    parseDocument: vi.fn(),
    applySemanticOps: vi.fn(),
    autoLayoutAll: vi.fn(),
    emptyDocument: vi.fn().mockReturnValue({
      meta: {
        version: '1.0',
        title: 'Untitled Diagram',
        created: '2025-01-01T00:00:00Z',
        modified: '2025-01-01T00:00:00Z',
      },
      nodes: [],
      edges: [],
      groups: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    }),
  })),
}));
vi.mock('./tools', () => ({
  registerDiagramTools: vi.fn(),
}));

import { activate, deactivate } from './extension';
import { DiagramEditorProvider } from './DiagramEditorProvider';
import { registerDiagramTools } from './tools';
import * as vscode from 'vscode';

describe('extension', () => {
  let context: vscode.ExtensionContext;

  beforeEach(() => {
    vi.clearAllMocks();
    context = {
      subscriptions: [],
      extensionUri: vscode.Uri.file('/ext'),
    } as unknown as vscode.ExtensionContext;
  });

  describe('activate', () => {
    it('registers the editor provider', () => {
      activate(context);
      expect(DiagramEditorProvider.register).toHaveBeenCalledTimes(1);
    });

    it('registers diagram tools', () => {
      activate(context);
      expect(registerDiagramTools).toHaveBeenCalledTimes(1);
    });

    it('registers 9 commands', () => {
      activate(context);
      expect(vscode.commands.registerCommand).toHaveBeenCalledTimes(9);

      const commandNames = vi
        .mocked(vscode.commands.registerCommand)
        .mock.calls.map((c) => c[0]);
      expect(commandNames).toContain('diagramflow.newDiagram');
      expect(commandNames).toContain('diagramflow.exportSVG');
      expect(commandNames).toContain('diagramflow.exportMermaid');
      expect(commandNames).toContain('diagramflow.autoLayout');
      expect(commandNames).toContain('diagramflow.autoLayoutForce');
      expect(commandNames).toContain('diagramflow.sortNodes');
      expect(commandNames).toContain('diagramflow.undo');
      expect(commandNames).toContain('diagramflow.redo');
      expect(commandNames).toContain('diagramflow.importSVG');
    });

    it('pushes subscriptions to context', () => {
      activate(context);
      expect(context.subscriptions.length).toBeGreaterThan(0);
    });
  });

  describe('deactivate', () => {
    it('is a no-op function', () => {
      expect(() => deactivate()).not.toThrow();
    });
  });

  describe('command callbacks', () => {
    function getCommandCallback(commandId: string): ((...args: any[]) => any) | undefined {
      const calls = vi.mocked(vscode.commands.registerCommand).mock.calls;
      const match = calls.find((c) => c[0] === commandId);
      return match?.[1] as ((...args: any[]) => any) | undefined;
    }

    it('exportSVG command calls internal export with svg', async () => {
      activate(context);
      const cb = getCommandCallback('diagramflow.exportSVG');
      expect(cb).toBeDefined();

      await cb!();

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'diagramflow.internal.export',
        'svg',
      );
    });

    it('exportMermaid command calls internal export with mermaid', async () => {
      activate(context);
      const cb = getCommandCallback('diagramflow.exportMermaid');
      expect(cb).toBeDefined();

      await cb!();

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'diagramflow.internal.export',
        'mermaid',
      );
    });

    it('autoLayout command calls diagramService.autoLayoutAll', async () => {
      activate(context);
      const cb = getCommandCallback('diagramflow.autoLayout');
      expect(cb).toBeDefined();

      await cb!();

      const { DiagramService: DS } = await import('./DiagramService');
      const serviceInstance = vi.mocked(DS).mock.results[0]?.value;
      expect(serviceInstance.autoLayoutAll).toHaveBeenCalled();
    });

    it('newDiagram command creates file when URI provided', async () => {
      const saveUri = vscode.Uri.file('/new.diagram');
      vi.mocked(vscode.window.showSaveDialog).mockResolvedValue(saveUri as any);

      activate(context);
      const cb = getCommandCallback('diagramflow.newDiagram');
      expect(cb).toBeDefined();

      await cb!();

      expect(vscode.window.showSaveDialog).toHaveBeenCalled();
      expect(vscode.workspace.fs.writeFile).toHaveBeenCalled();
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'vscode.open',
        saveUri,
      );
    });

    it('newDiagram command does nothing when dialog cancelled', async () => {
      vi.mocked(vscode.window.showSaveDialog).mockResolvedValue(undefined as any);

      activate(context);
      const cb = getCommandCallback('diagramflow.newDiagram');
      expect(cb).toBeDefined();

      await cb!();

      expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();
    });
  });
});
