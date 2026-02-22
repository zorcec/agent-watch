import * as vscode from 'vscode';
import type { DiagramService } from '../DiagramService';
import { openDiagramDocument, fileNameFromPath } from './toolHelpers';

interface RemoveNodesInput {
  /** Absolute path to the .diagram file to modify. */
  filePath: string;
  nodeIds: string[];
}

export class RemoveNodesTool implements vscode.LanguageModelTool<RemoveNodesInput> {
  constructor(private readonly diagramService: DiagramService) {}

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<RemoveNodesInput>,
    _token: vscode.CancellationToken,
  ) {
    const file = fileNameFromPath(options.input.filePath);
    return {
      invocationMessage: `Removing ${options.input.nodeIds.length} node(s) from ${file}...`,
      confirmationMessages: {
        title: 'Remove diagram nodes',
        message: new vscode.MarkdownString(
          `Remove **${options.input.nodeIds.length}** node(s) and their connected edges?\n\nIDs: ${options.input.nodeIds.join(', ')}`,
        ),
      },
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<RemoveNodesInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const opened = await openDiagramDocument(options.input.filePath);
    if ('error' in opened) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(opened.error),
      ]);
    }

    const ops = options.input.nodeIds.map((id) => ({
      op: 'remove_node' as const,
      id,
    }));

    const result = await this.diagramService.applySemanticOps(ops, opened.doc);

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(
        result.success
          ? `Removed ${options.input.nodeIds.length} node(s) and their connected edges.`
          : `Failed to remove nodes: ${result.error}`,
      ),
    ]);
  }
}
