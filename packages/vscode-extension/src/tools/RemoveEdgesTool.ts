import * as vscode from 'vscode';
import type { DiagramService } from '../DiagramService';
import { openDiagramDocument, fileNameFromPath } from './toolHelpers';

interface RemoveEdgesInput {
  /** Absolute path to the .diagram file to modify. */
  filePath: string;
  edgeIds: string[];
}

export class RemoveEdgesTool implements vscode.LanguageModelTool<RemoveEdgesInput> {
  constructor(private readonly diagramService: DiagramService) {}

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<RemoveEdgesInput>,
    _token: vscode.CancellationToken,
  ) {
    const file = fileNameFromPath(options.input.filePath);
    return {
      invocationMessage: `Removing ${options.input.edgeIds.length} edge(s) from ${file}...`,
      confirmationMessages: {
        title: 'Remove diagram edges',
        message: new vscode.MarkdownString(
          `Remove **${options.input.edgeIds.length}** edge(s)?\n\nIDs: ${options.input.edgeIds.join(', ')}`,
        ),
      },
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<RemoveEdgesInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const opened = await openDiagramDocument(options.input.filePath);
    if ('error' in opened) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(opened.error),
      ]);
    }

    const ops = options.input.edgeIds.map((id) => ({
      op: 'remove_edge' as const,
      id,
    }));

    const result = await this.diagramService.applySemanticOps(ops, opened.doc);

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(
        result.success
          ? `Removed ${options.input.edgeIds.length} edge(s).`
          : `Failed to remove edges: ${result.error}`,
      ),
    ]);
  }
}
