import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => import('./__mocks__/vscode'));

import { DiagramEditorProvider } from './DiagramEditorProvider';
import type { DiagramService } from './DiagramService';
import type { DiagramDocument } from './types/DiagramDocument';
import * as vscode from 'vscode';

function makeValidDoc(): DiagramDocument {
  return {
    meta: {
      version: '1.0',
      title: 'Test',
      created: '2025-01-01T00:00:00Z',
      modified: '2025-01-01T00:00:00Z',
    },
    nodes: [
      {
        id: 'n1',
        label: 'Node A',
        shape: 'rectangle',
        color: 'default',
        x: 0,
        y: 0,
        width: 160,
        height: 48,
        pinned: false,
      },
    ],
    edges: [],
    groups: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

function makeMockDiagramService(): DiagramService {
  return {
    setActiveDocument: vi.fn(),
    getActiveDocument: vi.fn().mockReturnValue(null),
    parseDocument: vi.fn().mockReturnValue(makeValidDoc()),
    applySemanticOps: vi.fn().mockResolvedValue({ success: true }),
    autoLayoutAll: vi.fn().mockResolvedValue(undefined),
    autoLayoutForce: vi.fn().mockResolvedValue(undefined),
    moveNode: vi.fn().mockResolvedValue(undefined),
    moveNodes: vi.fn().mockResolvedValue(undefined),
    moveGroup: vi.fn().mockResolvedValue(undefined),
    reconnectEdge: vi.fn().mockResolvedValue(undefined),
    emptyDocument: vi.fn(),
    undo: vi.fn().mockResolvedValue(undefined),
    redo: vi.fn().mockResolvedValue(undefined),
  } as unknown as DiagramService;
}

function makeMockContext(): vscode.ExtensionContext {
  return {
    subscriptions: [],
    extensionUri: vscode.Uri.file('/ext'),
  } as unknown as vscode.ExtensionContext;
}

function makeMockWebviewPanel(): vscode.WebviewPanel & {
  _messageHandler: ((msg: any) => void) | null;
  _disposeHandler: (() => void) | null;
} {
  let messageHandler: ((msg: any) => void) | null = null;
  let disposeHandler: (() => void) | null = null;

  return {
    _messageHandler: null,
    _disposeHandler: null,
    webview: {
      options: {},
      html: '',
      cspSource: 'test',
      asWebviewUri: (uri: any) => uri,
      onDidReceiveMessage: vi.fn((handler: any) => {
        messageHandler = handler;
        return { dispose: vi.fn() };
      }),
      postMessage: vi.fn().mockResolvedValue(true),
    },
    onDidDispose: vi.fn((handler: any) => {
      disposeHandler = handler;
      return { dispose: vi.fn() };
    }),
    onDidChangeViewState: vi.fn(() => ({ dispose: vi.fn() })),
    get _messageHandlerRef() {
      return messageHandler;
    },
    get _disposeHandlerRef() {
      return disposeHandler;
    },
  } as any;
}

describe('DiagramEditorProvider', () => {
  let service: DiagramService;
  let context: vscode.ExtensionContext;

  beforeEach(() => {
    vi.clearAllMocks();
    service = makeMockDiagramService();
    context = makeMockContext();
  });

  describe('register', () => {
    it('registers a custom editor provider', () => {
      DiagramEditorProvider.register(context, service as any);

      expect(vscode.window.registerCustomEditorProvider).toHaveBeenCalledTimes(
        1,
      );
      expect(vscode.window.registerCustomEditorProvider).toHaveBeenCalledWith(
        'diagramflow.editor',
        expect.any(Object),
        expect.objectContaining({
          webviewOptions: { retainContextWhenHidden: true },
          supportsMultipleEditorsPerDocument: false,
        }),
      );
    });
  });

  describe('resolveCustomTextEditor', () => {
    it('sets active document on resolve', async () => {
      DiagramEditorProvider.register(context, service as any);

      const provider = vi.mocked(vscode.window.registerCustomEditorProvider)
        .mock.calls[0][1] as any;

      const textDoc = {
        getText: () => JSON.stringify(makeValidDoc()),
        uri: vscode.Uri.file('/test.diagram'),
        lineCount: 1,
      } as unknown as vscode.TextDocument;
      const panel = makeMockWebviewPanel();
      const token = {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as unknown as vscode.CancellationToken;

      await provider.resolveCustomTextEditor(textDoc, panel, token);

      expect(service.setActiveDocument).toHaveBeenCalledWith(textDoc);
    });

    it('sets webview options with scripts enabled', async () => {
      DiagramEditorProvider.register(context, service as any);

      const provider = vi.mocked(vscode.window.registerCustomEditorProvider)
        .mock.calls[0][1] as any;

      const textDoc = {
        getText: () => JSON.stringify(makeValidDoc()),
        uri: vscode.Uri.file('/test.diagram'),
        lineCount: 1,
      } as unknown as vscode.TextDocument;
      const panel = makeMockWebviewPanel();
      const token = {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as unknown as vscode.CancellationToken;

      await provider.resolveCustomTextEditor(textDoc, panel, token);

      expect(panel.webview.options.enableScripts).toBe(true);
    });

    it('sets up message handler on webview', async () => {
      DiagramEditorProvider.register(context, service as any);

      const provider = vi.mocked(vscode.window.registerCustomEditorProvider)
        .mock.calls[0][1] as any;

      const textDoc = {
        getText: () => JSON.stringify(makeValidDoc()),
        uri: vscode.Uri.file('/test.diagram'),
        lineCount: 1,
      } as unknown as vscode.TextDocument;
      const panel = makeMockWebviewPanel();
      const token = {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as unknown as vscode.CancellationToken;

      await provider.resolveCustomTextEditor(textDoc, panel, token);

      expect(panel.webview.onDidReceiveMessage).toHaveBeenCalledTimes(1);
    });

    it('handles NODE_DRAGGED message', async () => {
      DiagramEditorProvider.register(context, service as any);
      const provider = vi.mocked(vscode.window.registerCustomEditorProvider)
        .mock.calls[0][1] as any;

      const textDoc = {
        getText: () => JSON.stringify(makeValidDoc()),
        uri: vscode.Uri.file('/test.diagram'),
        lineCount: 1,
      } as unknown as vscode.TextDocument;
      const panel = makeMockWebviewPanel();
      const token = {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as unknown as vscode.CancellationToken;

      await provider.resolveCustomTextEditor(textDoc, panel, token);

      const handler = vi.mocked(panel.webview.onDidReceiveMessage).mock
        .calls[0][0] as (msg: any) => void;

      await handler({
        type: 'NODE_DRAGGED',
        id: 'n1',
        position: { x: 50.7, y: 100.3 },
      });

      expect(service.moveNode).toHaveBeenCalledWith(
        'n1',
        { x: 50.7, y: 100.3 },
        textDoc,
      );
    });

    it('handles NODE_RESIZED message', async () => {
      DiagramEditorProvider.register(context, service as any);
      const provider = vi.mocked(vscode.window.registerCustomEditorProvider)
        .mock.calls[0][1] as any;

      const textDoc = {
        getText: () => JSON.stringify(makeValidDoc()),
        uri: vscode.Uri.file('/test.diagram'),
        lineCount: 1,
      } as unknown as vscode.TextDocument;
      const panel = makeMockWebviewPanel();
      const token = {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as unknown as vscode.CancellationToken;

      await provider.resolveCustomTextEditor(textDoc, panel, token);

      const handler = vi.mocked(panel.webview.onDidReceiveMessage).mock
        .calls[0][0] as (msg: any) => void;

      await handler({
        type: 'NODE_RESIZED',
        id: 'n1',
        dimensions: { width: 200.5, height: 80.9 },
      });

      expect(service.applySemanticOps).toHaveBeenCalledWith(
        [
          {
            op: 'update_node',
            id: 'n1',
            changes: { width: 201, height: 81 },
          },
        ],
        textDoc,
      );
    });

    it('handles DELETE_NODES message', async () => {
      DiagramEditorProvider.register(context, service as any);
      const provider = vi.mocked(vscode.window.registerCustomEditorProvider)
        .mock.calls[0][1] as any;

      const textDoc = {
        getText: () => JSON.stringify(makeValidDoc()),
        uri: vscode.Uri.file('/test.diagram'),
        lineCount: 1,
      } as unknown as vscode.TextDocument;
      const panel = makeMockWebviewPanel();
      const token = {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as unknown as vscode.CancellationToken;

      await provider.resolveCustomTextEditor(textDoc, panel, token);

      const handler = vi.mocked(panel.webview.onDidReceiveMessage).mock
        .calls[0][0] as (msg: any) => void;

      await handler({ type: 'DELETE_NODES', nodeIds: ['n1', 'n2'] });

      expect(service.applySemanticOps).toHaveBeenCalledWith(
        [
          { op: 'remove_node', id: 'n1' },
          { op: 'remove_node', id: 'n2' },
        ],
        textDoc,
      );
    });

    it('handles ADD_EDGE message', async () => {
      DiagramEditorProvider.register(context, service as any);
      const provider = vi.mocked(vscode.window.registerCustomEditorProvider)
        .mock.calls[0][1] as any;

      const textDoc = {
        getText: () => JSON.stringify(makeValidDoc()),
        uri: vscode.Uri.file('/test.diagram'),
        lineCount: 1,
      } as unknown as vscode.TextDocument;
      const panel = makeMockWebviewPanel();
      const token = {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as unknown as vscode.CancellationToken;

      await provider.resolveCustomTextEditor(textDoc, panel, token);

      const handler = vi.mocked(panel.webview.onDidReceiveMessage).mock
        .calls[0][0] as (msg: any) => void;

      await handler({
        type: 'ADD_EDGE',
        edge: { source: 'n1', target: 'n2', label: 'test' },
      });

      expect(service.applySemanticOps).toHaveBeenCalledWith(
        [
          {
            op: 'add_edge',
            edge: { source: 'n1', target: 'n2', label: 'test' },
          },
        ],
        textDoc,
      );
    });

    it('handles REQUEST_LAYOUT message', async () => {
      DiagramEditorProvider.register(context, service as any);
      const provider = vi.mocked(vscode.window.registerCustomEditorProvider)
        .mock.calls[0][1] as any;

      const textDoc = {
        getText: () => JSON.stringify(makeValidDoc()),
        uri: vscode.Uri.file('/test.diagram'),
        lineCount: 1,
      } as unknown as vscode.TextDocument;
      const panel = makeMockWebviewPanel();
      const token = {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as unknown as vscode.CancellationToken;

      await provider.resolveCustomTextEditor(textDoc, panel, token);

      const handler = vi.mocked(panel.webview.onDidReceiveMessage).mock
        .calls[0][0] as (msg: any) => void;

      await handler({ type: 'REQUEST_LAYOUT' });

      expect(service.autoLayoutAll).toHaveBeenCalledWith(textDoc, undefined);
    });

    it('handles UPDATE_NODE_PROPS message', async () => {
      DiagramEditorProvider.register(context, service as any);
      const provider = vi.mocked(vscode.window.registerCustomEditorProvider)
        .mock.calls[0][1] as any;

      const textDoc = {
        getText: () => JSON.stringify(makeValidDoc()),
        uri: vscode.Uri.file('/test.diagram'),
        lineCount: 1,
      } as unknown as vscode.TextDocument;
      const panel = makeMockWebviewPanel();
      const token = {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as unknown as vscode.CancellationToken;

      await provider.resolveCustomTextEditor(textDoc, panel, token);

      const handler = vi.mocked(panel.webview.onDidReceiveMessage).mock
        .calls[0][0] as (msg: any) => void;

      await handler({
        type: 'UPDATE_NODE_PROPS',
        id: 'n1',
        changes: { shape: 'diamond', color: 'blue', notes: 'API boundary' },
      });

      expect(service.applySemanticOps).toHaveBeenCalledWith(
        [
          {
            op: 'update_node',
            id: 'n1',
            changes: { shape: 'diamond', color: 'blue', notes: 'API boundary' },
          },
        ],
        textDoc,
      );
    });

    it('handles UPDATE_EDGE_PROPS message', async () => {
      DiagramEditorProvider.register(context, service as any);
      const provider = vi.mocked(vscode.window.registerCustomEditorProvider)
        .mock.calls[0][1] as any;

      const textDoc = {
        getText: () => JSON.stringify(makeValidDoc()),
        uri: vscode.Uri.file('/test.diagram'),
        lineCount: 1,
      } as unknown as vscode.TextDocument;
      const panel = makeMockWebviewPanel();
      const token = {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as unknown as vscode.CancellationToken;

      await provider.resolveCustomTextEditor(textDoc, panel, token);

      const handler = vi.mocked(panel.webview.onDidReceiveMessage).mock
        .calls[0][0] as (msg: any) => void;

      await handler({
        type: 'UPDATE_EDGE_PROPS',
        id: 'e1',
        changes: { style: 'dashed', arrow: 'open', animated: true },
      });

      expect(service.applySemanticOps).toHaveBeenCalledWith(
        [
          {
            op: 'update_edge',
            id: 'e1',
            changes: { style: 'dashed', arrow: 'open', animated: true },
          },
        ],
        textDoc,
      );
    });

    it('handles ADD_NODE message', async () => {
      DiagramEditorProvider.register(context, service as any);
      const provider = vi.mocked(vscode.window.registerCustomEditorProvider)
        .mock.calls[0][1] as any;

      const textDoc = {
        getText: () => JSON.stringify(makeValidDoc()),
        uri: vscode.Uri.file('/test.diagram'),
        lineCount: 1,
      } as unknown as vscode.TextDocument;
      const panel = makeMockWebviewPanel();
      const token = {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as unknown as vscode.CancellationToken;

      await provider.resolveCustomTextEditor(textDoc, panel, token);

      const handler = vi.mocked(panel.webview.onDidReceiveMessage).mock
        .calls[0][0] as (msg: any) => void;

      await handler({
        type: 'ADD_NODE',
        node: { label: 'New Node', shape: 'rectangle', color: 'blue' },
      });

      expect(service.applySemanticOps).toHaveBeenCalledWith(
        [
          {
            op: 'add_node',
            node: { label: 'New Node', shape: 'rectangle', color: 'blue' },
          },
        ],
        textDoc,
      );
    });

    it('handles DELETE_EDGES message', async () => {
      DiagramEditorProvider.register(context, service as any);
      const provider = vi.mocked(vscode.window.registerCustomEditorProvider)
        .mock.calls[0][1] as any;

      const textDoc = {
        getText: () => JSON.stringify(makeValidDoc()),
        uri: vscode.Uri.file('/test.diagram'),
        lineCount: 1,
      } as unknown as vscode.TextDocument;
      const panel = makeMockWebviewPanel();
      const token = {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as unknown as vscode.CancellationToken;

      await provider.resolveCustomTextEditor(textDoc, panel, token);

      const handler = vi.mocked(panel.webview.onDidReceiveMessage).mock
        .calls[0][0] as (msg: any) => void;

      await handler({ type: 'DELETE_EDGES', edgeIds: ['e1', 'e2'] });

      expect(service.applySemanticOps).toHaveBeenCalledWith(
        [
          { op: 'remove_edge', id: 'e1' },
          { op: 'remove_edge', id: 'e2' },
        ],
        textDoc,
      );
    });

    it('handles UPDATE_NODE_LABEL message', async () => {
      DiagramEditorProvider.register(context, service as any);
      const provider = vi.mocked(vscode.window.registerCustomEditorProvider)
        .mock.calls[0][1] as any;

      const textDoc = {
        getText: () => JSON.stringify(makeValidDoc()),
        uri: vscode.Uri.file('/test.diagram'),
        lineCount: 1,
      } as unknown as vscode.TextDocument;
      const panel = makeMockWebviewPanel();
      const token = {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as unknown as vscode.CancellationToken;

      await provider.resolveCustomTextEditor(textDoc, panel, token);

      const handler = vi.mocked(panel.webview.onDidReceiveMessage).mock
        .calls[0][0] as (msg: any) => void;

      await handler({ type: 'UPDATE_NODE_LABEL', id: 'n1', label: 'Updated Label' });

      expect(service.applySemanticOps).toHaveBeenCalledWith(
        [{ op: 'update_node', id: 'n1', changes: { label: 'Updated Label' } }],
        textDoc,
      );
    });

    it('handles EXPORT message with SVG format', async () => {
      DiagramEditorProvider.register(context, service as any);
      const provider = vi.mocked(vscode.window.registerCustomEditorProvider)
        .mock.calls[0][1] as any;

      const textDoc = {
        getText: () => JSON.stringify(makeValidDoc()),
        uri: vscode.Uri.file('/projects/test.diagram'),
        lineCount: 1,
        fsPath: '/projects/test.diagram',
      } as unknown as vscode.TextDocument;
      const panel = makeMockWebviewPanel();
      const token = {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as unknown as vscode.CancellationToken;

      const saveUri = vscode.Uri.file('/projects/test.svg');
      vi.mocked(vscode.window.showSaveDialog).mockResolvedValue(saveUri as any);

      await provider.resolveCustomTextEditor(textDoc, panel, token);

      const handler = vi.mocked(panel.webview.onDidReceiveMessage).mock
        .calls[0][0] as (msg: any) => void;

      await handler({ type: 'EXPORT', format: 'svg', data: '<svg>test</svg>' });

      expect(vscode.window.showSaveDialog).toHaveBeenCalled();
      expect(vscode.workspace.fs.writeFile).toHaveBeenCalled();
    });

    it('handles EXPORT message cancelled by user', async () => {
      DiagramEditorProvider.register(context, service as any);
      const provider = vi.mocked(vscode.window.registerCustomEditorProvider)
        .mock.calls[0][1] as any;

      const textDoc = {
        getText: () => JSON.stringify(makeValidDoc()),
        uri: vscode.Uri.file('/projects/test.diagram'),
        lineCount: 1,
        fsPath: '/projects/test.diagram',
      } as unknown as vscode.TextDocument;
      const panel = makeMockWebviewPanel();
      const token = {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as unknown as vscode.CancellationToken;

      vi.mocked(vscode.window.showSaveDialog).mockResolvedValue(undefined as any);

      await provider.resolveCustomTextEditor(textDoc, panel, token);

      const handler = vi.mocked(panel.webview.onDidReceiveMessage).mock
        .calls[0][0] as (msg: any) => void;

      await handler({ type: 'EXPORT', format: 'mermaid', data: 'graph LR' });

      expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();
    });

    it('handles OPEN_SVG_REQUEST message', async () => {
      DiagramEditorProvider.register(context, service as any);
      const provider = vi.mocked(vscode.window.registerCustomEditorProvider)
        .mock.calls[0][1] as any;

      const textDoc = {
        getText: () => JSON.stringify(makeValidDoc()),
        uri: vscode.Uri.file('/test.diagram'),
        lineCount: 1,
      } as unknown as vscode.TextDocument;
      const panel = makeMockWebviewPanel();
      const token = {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as unknown as vscode.CancellationToken;

      vi.mocked(vscode.window.showOpenDialog).mockResolvedValue(undefined as any);

      await provider.resolveCustomTextEditor(textDoc, panel, token);

      const handler = vi.mocked(panel.webview.onDidReceiveMessage).mock
        .calls[0][0] as (msg: any) => void;

      await handler({ type: 'OPEN_SVG_REQUEST' });

      expect(vscode.window.showOpenDialog).toHaveBeenCalled();
    });

    it('sends document on WEBVIEW_READY message', async () => {
      DiagramEditorProvider.register(context, service as any);
      const provider = vi.mocked(vscode.window.registerCustomEditorProvider)
        .mock.calls[0][1] as any;

      const textDoc = {
        getText: () => JSON.stringify(makeValidDoc()),
        uri: vscode.Uri.file('/test.diagram'),
        lineCount: 1,
      } as unknown as vscode.TextDocument;
      const panel = makeMockWebviewPanel();
      const token = {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as unknown as vscode.CancellationToken;

      await provider.resolveCustomTextEditor(textDoc, panel, token);

      const handler = vi.mocked(panel.webview.onDidReceiveMessage).mock
        .calls[0][0] as (msg: any) => void;

      vi.mocked(panel.webview.postMessage).mockClear();
      await handler({ type: 'WEBVIEW_READY' });

      expect(panel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'DOCUMENT_UPDATED' }),
      );
    });

    it('sends document on text document change', async () => {
      DiagramEditorProvider.register(context, service as any);
      const provider = vi.mocked(vscode.window.registerCustomEditorProvider)
        .mock.calls[0][1] as any;

      const docUri = vscode.Uri.file('/test.diagram');
      const textDoc = {
        getText: () => JSON.stringify(makeValidDoc()),
        uri: docUri,
        lineCount: 1,
      } as unknown as vscode.TextDocument;
      const panel = makeMockWebviewPanel();
      const token = {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as unknown as vscode.CancellationToken;

      await provider.resolveCustomTextEditor(textDoc, panel, token);

      const changeHandler = vi.mocked(vscode.workspace.onDidChangeTextDocument)
        .mock.calls[0][0] as (e: any) => void;

      vi.mocked(panel.webview.postMessage).mockClear();
      changeHandler({ document: { uri: docUri } });

      expect(panel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'DOCUMENT_UPDATED' }),
      );
    });

    it('ignores text changes for different document URIs', async () => {
      DiagramEditorProvider.register(context, service as any);
      const provider = vi.mocked(vscode.window.registerCustomEditorProvider)
        .mock.calls[0][1] as any;

      const docUri = vscode.Uri.file('/test.diagram');
      const textDoc = {
        getText: () => JSON.stringify(makeValidDoc()),
        uri: docUri,
        lineCount: 1,
      } as unknown as vscode.TextDocument;
      const panel = makeMockWebviewPanel();
      const token = {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as unknown as vscode.CancellationToken;

      await provider.resolveCustomTextEditor(textDoc, panel, token);

      const changeHandler = vi.mocked(vscode.workspace.onDidChangeTextDocument)
        .mock.calls[0][0] as (e: any) => void;

      vi.mocked(panel.webview.postMessage).mockClear();
      changeHandler({ document: { uri: vscode.Uri.file('/other.diagram') } });

      expect(panel.webview.postMessage).not.toHaveBeenCalled();
    });

    it('clears active document on dispose', async () => {
      DiagramEditorProvider.register(context, service as any);
      const provider = vi.mocked(vscode.window.registerCustomEditorProvider)
        .mock.calls[0][1] as any;

      const textDoc = {
        getText: () => JSON.stringify(makeValidDoc()),
        uri: vscode.Uri.file('/test.diagram'),
        lineCount: 1,
      } as unknown as vscode.TextDocument;

      vi.mocked(service.getActiveDocument).mockReturnValue(
        textDoc as unknown as any,
      );

      const panel = makeMockWebviewPanel();
      const token = {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as unknown as vscode.CancellationToken;

      await provider.resolveCustomTextEditor(textDoc, panel, token);

      const disposeHandler = vi.mocked(panel.onDidDispose).mock
        .calls[0][0] as () => void;

      disposeHandler();

      expect(service.setActiveDocument).toHaveBeenCalledWith(null);
    });

    it('does not clear active document if different doc is active on dispose', async () => {
      DiagramEditorProvider.register(context, service as any);
      const provider = vi.mocked(vscode.window.registerCustomEditorProvider)
        .mock.calls[0][1] as any;

      const textDoc = {
        getText: () => JSON.stringify(makeValidDoc()),
        uri: vscode.Uri.file('/test.diagram'),
        lineCount: 1,
      } as unknown as vscode.TextDocument;

      const otherDoc = {
        getText: () => JSON.stringify(makeValidDoc()),
        uri: vscode.Uri.file('/other.diagram'),
        lineCount: 1,
      } as unknown as vscode.TextDocument;

      vi.mocked(service.getActiveDocument).mockReturnValue(
        otherDoc as unknown as any,
      );

      const panel = makeMockWebviewPanel();
      const token = {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as unknown as vscode.CancellationToken;

      await provider.resolveCustomTextEditor(textDoc, panel, token);

      const disposeHandler = vi.mocked(panel.onDidDispose).mock
        .calls[0][0] as () => void;

      vi.mocked(service.setActiveDocument).mockClear();
      disposeHandler();

      expect(service.setActiveDocument).not.toHaveBeenCalledWith(null);
    });
  });

  describe('openSvgImportFlow', () => {
    it('does nothing when open dialog is cancelled', async () => {
      vi.mocked(vscode.window.showOpenDialog).mockResolvedValue(undefined as any);

      await DiagramEditorProvider.openSvgImportFlow();

      expect(vscode.window.showOpenDialog).toHaveBeenCalled();
      expect(vscode.workspace.fs.readFile).not.toHaveBeenCalled();
    });

    it('shows error when SVG has no embedded diagram data', async () => {
      const openUri = vscode.Uri.file('/test.svg');
      vi.mocked(vscode.window.showOpenDialog).mockResolvedValue([openUri] as any);
      vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
        new TextEncoder().encode('<svg></svg>') as any,
      );

      await DiagramEditorProvider.openSvgImportFlow();

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('No embedded .diagram source'),
      );
    });

    it('creates .diagram file from valid SVG with embedded data', async () => {
      const validDoc = makeValidDoc();
      const svgContent = `<svg><metadata><diagramflow:source xmlns:diagramflow="https://diagramflow.vscode/schema">${JSON.stringify(validDoc)}</diagramflow:source></metadata></svg>`;

      const openUri = vscode.Uri.file('/test.svg');
      const saveUri = vscode.Uri.file('/imported.diagram');
      vi.mocked(vscode.window.showOpenDialog).mockResolvedValue([openUri] as any);
      vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
        new TextEncoder().encode(svgContent) as any,
      );
      vi.mocked(vscode.window.showSaveDialog).mockResolvedValue(saveUri as any);

      await DiagramEditorProvider.openSvgImportFlow();

      expect(vscode.workspace.fs.writeFile).toHaveBeenCalledWith(
        saveUri,
        expect.any(Buffer),
      );
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'vscode.openWith',
        saveUri,
        'diagramflow.editor',
      );
    });

    it('does nothing when save dialog is cancelled after valid SVG', async () => {
      const validDoc = makeValidDoc();
      const svgContent = `<svg><metadata><diagramflow:source xmlns:diagramflow="https://diagramflow.vscode/schema">${JSON.stringify(validDoc)}</diagramflow:source></metadata></svg>`;

      const openUri = vscode.Uri.file('/test.svg');
      vi.mocked(vscode.window.showOpenDialog).mockResolvedValue([openUri] as any);
      vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
        new TextEncoder().encode(svgContent) as any,
      );
      vi.mocked(vscode.window.showSaveDialog).mockResolvedValue(undefined as any);

      await DiagramEditorProvider.openSvgImportFlow();

      expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();
    });
  });
});
