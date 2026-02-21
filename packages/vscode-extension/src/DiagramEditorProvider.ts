import * as path from 'path';
import * as vscode from 'vscode';
import { DiagramService } from './DiagramService';
import { getWebviewContent } from './getWebviewContent';
import { extractDiagramFromSvg } from './lib/svgMetadata';
import type { WebviewMessage } from './messages/protocol';

export class DiagramEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'diagramflow.editor';

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly diagramService: DiagramService,
  ) {}

  public static register(
    context: vscode.ExtensionContext,
    diagramService: DiagramService,
  ): vscode.Disposable {
    const provider = new DiagramEditorProvider(context, diagramService);
    return vscode.window.registerCustomEditorProvider(
      DiagramEditorProvider.viewType,
      provider,
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      },
    );
  }

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    this.diagramService.setActiveDocument(document);

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
      ],
    };
    webviewPanel.webview.html = getWebviewContent(
      webviewPanel.webview,
      this.context.extensionUri,
    );

    const sendDocument = () => {
      const doc = this.diagramService.parseDocument(document);
      if (doc) {
        webviewPanel.webview.postMessage({ type: 'DOCUMENT_UPDATED', doc });
      }
    };

    const changeSubscription = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() === document.uri.toString()) {
        sendDocument();
      }
    });

    webviewPanel.webview.onDidReceiveMessage(async (msg: WebviewMessage) => {
      if (msg.type === 'WEBVIEW_READY') {
        sendDocument();
        return;
      }
      await this.handleWebviewMessage(msg, document);
    });

    webviewPanel.onDidDispose(() => {
      changeSubscription.dispose();
      if (this.diagramService.getActiveDocument() === document) {
        this.diagramService.setActiveDocument(null);
      }
    });
  }

  private async handleWebviewMessage(
    msg: WebviewMessage,
    document: vscode.TextDocument,
  ): Promise<void> {
    switch (msg.type) {
      case 'WEBVIEW_READY':
        break; // handled in resolveCustomTextEditor closure

      case 'NODE_DRAGGED':
        // Use moveNode to always update position regardless of pinned status
        // (pinned means layout engine won't move it, not that the user can't).
        await this.diagramService.moveNode(msg.id, msg.position, document);
        break;

      case 'NODES_DRAGGED':
        await this.diagramService.moveNodes(msg.moves, document);
        break;

      case 'GROUP_DRAGGED':
        await this.diagramService.moveGroup(msg.id, msg.position, document);
        break;

      case 'NODE_RESIZED':
        await this.diagramService.applySemanticOps(
          [
            {
              op: 'update_node',
              id: msg.id,
              changes: {
                width: Math.round(msg.dimensions.width),
                height: Math.round(msg.dimensions.height),
              },
            },
          ],
          document,
        );
        break;

      case 'ADD_NODE':
        await this.diagramService.applySemanticOps(
          [{ op: 'add_node', node: msg.node as any }],
          document,
        );
        break;

      case 'DELETE_NODES':
        await this.diagramService.applySemanticOps(
          msg.nodeIds.map((id) => ({ op: 'remove_node' as const, id })),
          document,
        );
        break;

      case 'ADD_GROUP':
        await this.diagramService.applySemanticOps(
          [{ op: 'add_group', group: { label: msg.label } }],
          document,
        );
        break;

      case 'DELETE_GROUPS':
        await this.diagramService.applySemanticOps(
          msg.groupIds.map((id) => ({ op: 'remove_group' as const, id })),
          document,
        );
        break;

      case 'UPDATE_GROUP_PROPS':
        await this.diagramService.applySemanticOps(
          [{ op: 'update_group', id: msg.id, changes: msg.changes }],
          document,
        );
        break;

      case 'ADD_EDGE':
        await this.diagramService.applySemanticOps(
          [{ op: 'add_edge', edge: msg.edge }],
          document,
        );
        break;

      case 'DELETE_EDGES':
        await this.diagramService.applySemanticOps(
          msg.edgeIds.map((id) => ({ op: 'remove_edge' as const, id })),
          document,
        );
        break;

      case 'UPDATE_NODE_LABEL':
        await this.diagramService.applySemanticOps(
          [{ op: 'update_node', id: msg.id, changes: { label: msg.label } }],
          document,
        );
        break;

      case 'UPDATE_NODE_PROPS': {
        const { group, ...rest } = msg.changes;
        const changes: any = { ...rest };
        if (group !== undefined) {
          changes.group = group === null ? undefined : group;
        }
        await this.diagramService.applySemanticOps(
          [{ op: 'update_node', id: msg.id, changes }],
          document,
        );
        break;
      }

      case 'UPDATE_EDGE_PROPS':
        await this.diagramService.applySemanticOps(
          [{ op: 'update_edge', id: msg.id, changes: msg.changes }],
          document,
        );
        break;

      case 'REQUEST_LAYOUT':
        await this.diagramService.autoLayoutAll(document);
        break;

      case 'EXPORT':
        await this.handleExport(msg.format, msg.data, document);
        break;

      case 'OPEN_SVG_REQUEST':
        await DiagramEditorProvider.openSvgImportFlow();
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Export: SVG / PNG / Mermaid
  // ---------------------------------------------------------------------------

  private async handleExport(
    format: 'svg' | 'png' | 'mermaid',
    data: string,
    document: vscode.TextDocument,
  ): Promise<void> {
    const filterMap: Record<string, { label: string; ext: string }> = {
      svg: { label: 'SVG Image', ext: 'svg' },
      png: { label: 'PNG Image', ext: 'png' },
      mermaid: { label: 'Mermaid Diagram', ext: 'mmd' },
    };

    const { label, ext } = filterMap[format] ?? { label: 'File', ext: 'txt' };

    // Default export path: same directory and base name as the .diagram file.
    const docFsPath = document.uri.fsPath;
    const baseName = path.basename(docFsPath, path.extname(docFsPath));
    const dir = path.dirname(docFsPath);
    const defaultFsPath = path.join(dir, `${baseName}.${ext}`);

    const saveUri = await vscode.window.showSaveDialog({
      filters: { [label]: [ext] },
      defaultUri: vscode.Uri.file(defaultFsPath),
    });
    if (!saveUri) return;

    const bytes =
      format === 'png'
        ? Buffer.from(data, 'base64')
        : Buffer.from(data, 'utf-8');

    await vscode.workspace.fs.writeFile(saveUri, bytes);
    vscode.window.showInformationMessage(
      `Diagram exported as ${ext.toUpperCase()}: ${saveUri.fsPath}`,
    );
  }

  // ---------------------------------------------------------------------------
  // Open: import .diagram source embedded in an SVG file
  // ---------------------------------------------------------------------------

  public static async openSvgImportFlow(): Promise<void> {
    const [openUri] = (await vscode.window.showOpenDialog({
      filters: { 'SVG Files': ['svg'] },
      canSelectMany: false,
      openLabel: 'Import SVG',
    })) ?? [];
    if (!openUri) return;

    const bytes = await vscode.workspace.fs.readFile(openUri);
    const svgContent = Buffer.from(bytes).toString('utf-8');

    const diagramJson = extractDiagramFromSvg(svgContent);
    if (!diagramJson) {
      vscode.window.showErrorMessage(
        'No embedded .diagram source found in this SVG. ' +
          'Only SVGs exported by DiagramFlow contain importable diagram data.',
      );
      return;
    }

    const saveUri = await vscode.window.showSaveDialog({
      filters: { 'Diagram Files': ['diagram'] },
      defaultUri: vscode.Uri.joinPath(openUri, '..', 'imported.diagram'),
    });
    if (!saveUri) return;

    await vscode.workspace.fs.writeFile(saveUri, Buffer.from(diagramJson, 'utf-8'));
    await vscode.commands.executeCommand(
      'vscode.openWith',
      saveUri,
      DiagramEditorProvider.viewType,
    );
  }
}

