import * as vscode from 'vscode';
import type { DiagramService } from '../DiagramService';

export class GetDiagramTool implements vscode.LanguageModelTool<Record<string, never>> {
  constructor(private readonly diagramService: DiagramService) {}

  async prepareInvocation(
    _options: vscode.LanguageModelToolInvocationPrepareOptions<Record<string, never>>,
    _token: vscode.CancellationToken,
  ) {
    return { invocationMessage: 'Reading current diagram...' };
  }

  async invoke(
    _options: vscode.LanguageModelToolInvocationOptions<Record<string, never>>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const doc = this.diagramService.parseDocument();
    if (!doc) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          'No .diagram file is currently open. Open a .diagram file first.',
        ),
      ]);
    }

    const compact = {
      title: doc.meta?.title ?? '',
      description: doc.meta?.description,
      nodes: doc.nodes.map((n) => ({
        id: n.id,
        label: n.label,
        shape: n.shape !== 'rectangle' ? n.shape : undefined,
        color: n.color !== 'default' ? n.color : undefined,
        pinned: n.pinned || undefined,
        group: n.group,
      })),
      edges: doc.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        style: e.style !== 'solid' ? e.style : undefined,
      })),
      groups: doc.groups,
    };

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(JSON.stringify(compact, null, 2)),
    ]);
  }
}
