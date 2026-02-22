import * as vscode from 'vscode';
import type { DiagramService } from '../DiagramService';
import type { EdgeStyle, ArrowType } from '../types/DiagramDocument';
import { openDiagramDocument, fileNameFromPath } from './toolHelpers';

interface AddEdgesInput {
  /** Absolute path to the .diagram file to modify. */
  filePath: string;
  edges: {
    source: string;
    target: string;
    label?: string;
    style?: string;
    arrow?: string;
    animated?: boolean;
  }[];
}

export class AddEdgesTool implements vscode.LanguageModelTool<AddEdgesInput> {
  constructor(private readonly diagramService: DiagramService) {}

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<AddEdgesInput>,
    _token: vscode.CancellationToken,
  ) {
    const count = options.input.edges.length;
    const file = fileNameFromPath(options.input.filePath);
    return {
      invocationMessage: `Adding ${count} edge(s) to ${file}...`,
      confirmationMessages: {
        title: 'Add diagram edges',
        message: new vscode.MarkdownString(
          `Add **${count}** edge(s) to the diagram.`,
        ),
      },
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<AddEdgesInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const opened = await openDiagramDocument(options.input.filePath);
    if ('error' in opened) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(opened.error),
      ]);
    }

    const ops = options.input.edges.map((e) => ({
      op: 'add_edge' as const,
      edge: {
        source: e.source,
        target: e.target,
        ...(e.label && { label: e.label }),
        ...(e.style && { style: e.style as EdgeStyle }),
        ...(e.arrow && { arrow: e.arrow as ArrowType }),
        ...(e.animated !== undefined && { animated: e.animated }),
      },
    }));

    const result = await this.diagramService.applySemanticOps(ops, opened.doc);

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(
        result.success
          ? `Added ${options.input.edges.length} edge(s).`
          : `Failed to add edges: ${result.error}`,
      ),
    ]);
  }
}
