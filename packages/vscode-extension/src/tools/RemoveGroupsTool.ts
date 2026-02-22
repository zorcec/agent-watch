import * as vscode from 'vscode';
import type { DiagramService } from '../DiagramService';
import { openDiagramDocument, fileNameFromPath } from './toolHelpers';

interface RemoveGroupsInput {
  /** Absolute path to the .diagram file to modify. */
  filePath: string;
  groupIds: string[];
}

export class RemoveGroupsTool implements vscode.LanguageModelTool<RemoveGroupsInput> {
  constructor(private readonly diagramService: DiagramService) {}

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<RemoveGroupsInput>,
    _token: vscode.CancellationToken,
  ) {
    const count = options.input.groupIds.length;
    const file = fileNameFromPath(options.input.filePath);
    return {
      invocationMessage: `Removing ${count} group(s) from ${file}...`,
      confirmationMessages: {
        title: 'Remove diagram groups',
        message: new vscode.MarkdownString(
          `Remove **${count}** group(s): ${options.input.groupIds.join(', ')}. ` +
            'Child nodes will remain but be detached from their group.',
        ),
      },
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<RemoveGroupsInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const opened = await openDiagramDocument(options.input.filePath);
    if ('error' in opened) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(opened.error),
      ]);
    }

    const ops = options.input.groupIds.map((id) => ({
      op: 'remove_group' as const,
      id,
    }));

    const result = await this.diagramService.applySemanticOps(ops, opened.doc);

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(
        result.success
          ? `Removed ${options.input.groupIds.length} group(s).`
          : `Failed to remove groups: ${result.error}`,
      ),
    ]);
  }
}
