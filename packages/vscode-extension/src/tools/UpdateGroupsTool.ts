import * as vscode from 'vscode';
import type { DiagramService } from '../DiagramService';
import type { NodeColor } from '../types/DiagramDocument';
import { openDiagramDocument, fileNameFromPath } from './toolHelpers';

interface UpdateGroupsInput {
  /** Absolute path to the .diagram file to modify. */
  filePath: string;
  updates: {
    id: string;
    label?: string;
    color?: string;
  }[];
}

export class UpdateGroupsTool implements vscode.LanguageModelTool<UpdateGroupsInput> {
  constructor(private readonly diagramService: DiagramService) {}

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<UpdateGroupsInput>,
    _token: vscode.CancellationToken,
  ) {
    const count = options.input.updates.length;
    const file = fileNameFromPath(options.input.filePath);
    return {
      invocationMessage: `Updating ${count} group(s) in ${file}...`,
      confirmationMessages: {
        title: 'Update diagram groups',
        message: new vscode.MarkdownString(
          `Update **${count}** group(s): ${options.input.updates.map((u) => u.id).join(', ')}`,
        ),
      },
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<UpdateGroupsInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const opened = await openDiagramDocument(options.input.filePath);
    if ('error' in opened) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(opened.error),
      ]);
    }

    const ops = options.input.updates.map((u) => ({
      op: 'update_group' as const,
      id: u.id,
      changes: {
        ...(u.label !== undefined && { label: u.label }),
        ...(u.color && { color: u.color as NodeColor }),
      },
    }));

    const result = await this.diagramService.applySemanticOps(ops, opened.doc);

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(
        result.success
          ? `Updated ${options.input.updates.length} group(s).`
          : `Failed to update groups: ${result.error}`,
      ),
    ]);
  }
}
