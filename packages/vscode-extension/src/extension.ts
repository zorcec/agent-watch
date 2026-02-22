import * as vscode from 'vscode';
import { DiagramEditorProvider } from './DiagramEditorProvider';
import { DiagramService } from './DiagramService';
import { registerDiagramTools } from './tools';

export function activate(context: vscode.ExtensionContext): void {
  const diagramService = new DiagramService();

  context.subscriptions.push(
    DiagramEditorProvider.register(context, diagramService),
  );

  registerDiagramTools(context, diagramService);

  context.subscriptions.push(
    vscode.commands.registerCommand('diagramflow.newDiagram', async () => {
      const uri = await promptForNewDiagramLocation();
      if (uri) {
        await createEmptyDiagramFile(uri, diagramService);
        await vscode.commands.executeCommand('vscode.open', uri);
      }
    }),
    vscode.commands.registerCommand('diagramflow.exportSVG', () => {
      vscode.commands.executeCommand('diagramflow.internal.export', 'svg');
    }),
    vscode.commands.registerCommand('diagramflow.exportMermaid', () => {
      vscode.commands.executeCommand('diagramflow.internal.export', 'mermaid');
    }),
    vscode.commands.registerCommand('diagramflow.sortNodes', () => {
      // If no activeDocument (e.g. panel lost focus), try finding any open .diagram file.
      if (!diagramService.getActiveDocument()) {
        const fallback = vscode.workspace.textDocuments.find(
          (d) => d.fileName.endsWith('.diagram') && !d.isClosed,
        );
        if (fallback) {
          diagramService.setActiveDocument(fallback);
        }
      }
      diagramService.sortNodes();
    }),
    vscode.commands.registerCommand('diagramflow.autoLayout', () => {
      if (!diagramService.getActiveDocument()) {
        const fallback = vscode.workspace.textDocuments.find(
          (d) => d.fileName.endsWith('.diagram') && !d.isClosed,
        );
        if (fallback) {
          diagramService.setActiveDocument(fallback);
        }
      }
      diagramService.autoLayoutAll();
    }),
    vscode.commands.registerCommand('diagramflow.autoLayoutForce', () => {
      diagramService.autoLayoutForce();
    }),
    vscode.commands.registerCommand('diagramflow.undo', () => {
      diagramService.undo();
    }),
    vscode.commands.registerCommand('diagramflow.redo', () => {
      diagramService.redo();
    }),
    vscode.commands.registerCommand('diagramflow.importSVG', () => {
      DiagramEditorProvider.openSvgImportFlow();
    }),
  );
}

export function deactivate(): void {}

async function promptForNewDiagramLocation(): Promise<vscode.Uri | undefined> {
  const uri = await vscode.window.showSaveDialog({
    filters: { Diagram: ['diagram'] },
    defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri
      ? vscode.Uri.joinPath(
          vscode.workspace.workspaceFolders[0].uri,
          'untitled.diagram',
        )
      : undefined,
  });
  return uri;
}

async function createEmptyDiagramFile(
  uri: vscode.Uri,
  diagramService: DiagramService,
): Promise<void> {
  const doc = diagramService.emptyDocument();
  const content = JSON.stringify(doc, null, 2);
  await vscode.workspace.fs.writeFile(
    uri,
    new TextEncoder().encode(content),
  );
}
