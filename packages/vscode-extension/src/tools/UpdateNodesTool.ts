import * as vscode from 'vscode';
import type { DiagramService } from '../DiagramService';
import type { NodeShape, NodeColor } from '../types/DiagramDocument';
import { openDiagramDocument, fileNameFromPath } from './toolHelpers';

interface UpdateNodesInput {
  /** Absolute path to the .diagram file to modify. */
  filePath: string;
  updates: {
    id: string;
    label?: string;
    shape?: string;
    color?: string;
    notes?: string;
    group?: string;
  }[];
}

export class UpdateNodesTool implements vscode.LanguageModelTool<UpdateNodesInput> {
  constructor(private readonly diagramService: DiagramService) {}

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<UpdateNodesInput>,
    _token: vscode.CancellationToken,
  ) {
    const count = options.input.updates.length;
    const file = fileNameFromPath(options.input.filePath);
    return {
      invocationMessage: `Updating ${count} node(s) in ${file}...`,
      confirmationMessages: {
        title: 'Update diagram nodes',
        message: new vscode.MarkdownString(
          `Update **${count}** node(s): ${options.input.updates.map((u) => u.id).join(', ')}`,
        ),
      },
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<UpdateNodesInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const opened = await openDiagramDocument(options.input.filePath);
    if ('error' in opened) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(opened.error),
      ]);
    }

    const ops = options.input.updates.map((u) => ({
      op: 'update_node' as const,
      id: u.id,
      changes: {
        ...(u.label !== undefined && { label: u.label }),
        ...(u.shape && { shape: u.shape as NodeShape }),
        ...(u.color && { color: u.color as NodeColor }),
        ...(u.notes !== undefined && { notes: u.notes }),
        ...(u.group !== undefined && { group: u.group }),
      },
    }));

    const result = await this.diagramService.applySemanticOps(ops, opened.doc);

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(
        result.success
          ? `Updated ${options.input.updates.length} node(s).`
          : `Failed to update nodes: ${result.error}`,
      ),
    ]);
  }
}
