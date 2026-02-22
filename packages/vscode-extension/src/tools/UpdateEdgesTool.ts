import * as vscode from 'vscode';
import type { DiagramService } from '../DiagramService';
import type { EdgeStyle, ArrowType } from '../types/DiagramDocument';
import { openDiagramDocument, fileNameFromPath } from './toolHelpers';

interface UpdateEdgesInput {
  /** Absolute path to the .diagram file to modify. */
  filePath: string;
  updates: {
    id: string;
    label?: string;
    style?: string;
    arrow?: string;
    animated?: boolean;
    source?: string;
    target?: string;
  }[];
}

export class UpdateEdgesTool implements vscode.LanguageModelTool<UpdateEdgesInput> {
  constructor(private readonly diagramService: DiagramService) {}

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<UpdateEdgesInput>,
    _token: vscode.CancellationToken,
  ) {
    const count = options.input.updates.length;
    const file = fileNameFromPath(options.input.filePath);
    return {
      invocationMessage: `Updating ${count} edge(s) in ${file}...`,
      confirmationMessages: {
        title: 'Update diagram edges',
        message: new vscode.MarkdownString(
          `Update **${count}** edge(s): ${options.input.updates.map((u) => u.id).join(', ')}`,
        ),
      },
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<UpdateEdgesInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const opened = await openDiagramDocument(options.input.filePath);
    if ('error' in opened) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(opened.error),
      ]);
    }

    const ops = options.input.updates.map((u) => ({
      op: 'update_edge' as const,
      id: u.id,
      changes: {
        ...(u.label !== undefined && { label: u.label }),
        ...(u.style && { style: u.style as EdgeStyle }),
        ...(u.arrow && { arrow: u.arrow as ArrowType }),
        ...(u.animated !== undefined && { animated: u.animated }),
        ...(u.source && { source: u.source }),
        ...(u.target && { target: u.target }),
      },
    }));

    const result = await this.diagramService.applySemanticOps(ops, opened.doc);

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(
        result.success
          ? `Updated ${options.input.updates.length} edge(s).`
          : `Failed to update edges: ${result.error}`,
      ),
    ]);
  }
}
