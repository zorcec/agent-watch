import * as vscode from 'vscode';
import type { DiagramService } from '../DiagramService';
import type { NodeShape, NodeColor } from '../types/DiagramDocument';
import { openDiagramDocument, fileNameFromPath } from './toolHelpers';

interface AddNodesInput {
  /** Absolute path to the .diagram file to modify. */
  filePath: string;
  nodes: {
    label: string;
    shape?: string;
    color?: string;
    notes?: string;
    group?: string;
  }[];
}

export class AddNodesTool implements vscode.LanguageModelTool<AddNodesInput> {
  constructor(private readonly diagramService: DiagramService) {}

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<AddNodesInput>,
    _token: vscode.CancellationToken,
  ) {
    const count = options.input.nodes.length;
    const labels = options.input.nodes.map((n) => n.label).join(', ');
    const file = fileNameFromPath(options.input.filePath);
    return {
      invocationMessage: `Adding ${count} node(s) to ${file}: ${labels}`,
      confirmationMessages: {
        title: 'Add diagram nodes',
        message: new vscode.MarkdownString(
          `Add **${count}** node(s) to the diagram: ${labels}`,
        ),
      },
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<AddNodesInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const opened = await openDiagramDocument(options.input.filePath);
    if ('error' in opened) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(opened.error),
      ]);
    }

    const ops = options.input.nodes.map((n) => ({
      op: 'add_node' as const,
      node: {
        label: n.label,
        ...(n.shape && { shape: n.shape as NodeShape }),
        ...(n.color && { color: n.color as NodeColor }),
        ...(n.notes && { notes: n.notes }),
        ...(n.group && { group: n.group }),
      },
    }));

    const result = await this.diagramService.applySemanticOps(ops, opened.doc);

    if (!result.success) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(`Failed to add nodes: ${result.error}`),
      ]);
    }

    const doc = this.diagramService.parseDocument(opened.doc);
    const addedNodes = doc?.nodes.slice(-options.input.nodes.length) ?? [];
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(
        `Added ${options.input.nodes.length} node(s). IDs: ${addedNodes.map((n) => `${n.id} (${n.label})`).join(', ')}`,
      ),
    ]);
  }
}
