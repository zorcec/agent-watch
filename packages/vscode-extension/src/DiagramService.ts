import * as vscode from 'vscode';
import type { DiagramDocument } from './types/DiagramDocument';
import { GROUP_PADDING, GROUP_LABEL_HEIGHT } from './types/DiagramDocument';
import type { SemanticOp } from './types/operations';
import { applyOps, createEmptyDocument } from './lib/operations';
import { computePartialLayout, computeFullLayout } from './lib/layoutEngine';
import { generateAgentContext } from './lib/agentContext';
import { nanoid } from 'nanoid';

export class DiagramService {
  private activeDocument: vscode.TextDocument | null = null;

  setActiveDocument(doc: vscode.TextDocument | null): void {
    this.activeDocument = doc;
  }

  getActiveDocument(): vscode.TextDocument | null {
    return this.activeDocument;
  }

  parseDocument(doc?: vscode.TextDocument): DiagramDocument | null {
    const target = doc ?? this.activeDocument;
    if (!target) return null;
    try {
      return JSON.parse(target.getText()) as DiagramDocument;
    } catch {
      return null;
    }
  }

  async applySemanticOps(
    ops: SemanticOp[],
    doc?: vscode.TextDocument,
  ): Promise<{ success: boolean; error?: string }> {
    const target = doc ?? this.activeDocument;
    if (!target) return { success: false, error: 'No active diagram document' };

    const current = this.parseDocument(target);
    if (!current) return { success: false, error: 'Failed to parse diagram document' };

    const result = applyOps(current, ops, () => nanoid(8));
    if (!result.success || !result.document) {
      return { success: false, error: result.error };
    }

    let modified = result.document;
    modified = applyPartialLayout(modified);

    return writeDocumentToFile(target, modified);
  }

  async autoLayoutAll(doc?: vscode.TextDocument): Promise<void> {
    const target = doc ?? this.activeDocument;
    if (!target) return;

    const current = this.parseDocument(target);
    if (!current) return;

    const resetDoc = structuredClone(current);
    // Only reset positions for non-pinned nodes; pinned nodes stay where the user placed them.
    for (const node of resetDoc.nodes) {
      if (!node.pinned) {
        node.x = 0;
        node.y = 0;
      }
    }

    const layoutResults = computeFullLayout(resetDoc);
    for (const lr of layoutResults) {
      const node = resetDoc.nodes.find((n) => n.id === lr.nodeId);
      if (node) {
        node.x = lr.x;
        node.y = lr.y;
      }
    }

    resetDoc.meta.modified = new Date().toISOString();
    resetDoc.agentContext = generateAgentContext(resetDoc);
    await writeDocumentToFile(target, resetDoc);
  }

  /**
   * Moves multiple nodes to explicit positions in a single write.
   * Used for batch drag of a multi-node selection.
   */
  async moveNodes(
    moves: Array<{ id: string; position: { x: number; y: number } }>,
    doc?: vscode.TextDocument,
  ): Promise<void> {
    const target = doc ?? this.activeDocument;
    if (!target) return;

    const current = this.parseDocument(target);
    if (!current) return;

    const modified = structuredClone(current);
    for (const { id, position } of moves) {
      const node = modified.nodes.find((n) => n.id === id);
      if (!node) continue;
      node.x = position.x;
      node.y = position.y;
      node.pinned = true;
    }

    modified.meta.modified = new Date().toISOString();
    modified.agentContext = generateAgentContext(modified);
    await writeDocumentToFile(target, modified);
  }

  /**
   * Moves a node to an explicit position, bypassing the pinned check.
   * This is used for user-initiated drags (where even a pinned node can be repositioned).
   * Sets `pinned = true` so the auto-layout won't displace it afterwards.
   */
  async moveNode(
    id: string,
    position: { x: number; y: number },
    doc?: vscode.TextDocument,
  ): Promise<void> {
    const target = doc ?? this.activeDocument;
    if (!target) return;

    const current = this.parseDocument(target);
    if (!current) return;

    const modified = structuredClone(current);
    const node = modified.nodes.find((n) => n.id === id);
    if (!node) return;

    node.x = position.x;
    node.y = position.y;
    node.pinned = true;

    modified.meta.modified = new Date().toISOString();
    modified.agentContext = generateAgentContext(modified);
    await writeDocumentToFile(target, modified);
  }

  /**
   * Moves a group node and all its child nodes by the displacement from the
   * group's old computed position to the given new position.
   */
  async moveGroup(
    groupId: string,
    newPosition: { x: number; y: number },
    doc?: vscode.TextDocument,
  ): Promise<void> {
    const target = doc ?? this.activeDocument;
    if (!target) return;

    const current = this.parseDocument(target);
    if (!current) return;

    const modified = structuredClone(current);
    const group = modified.groups?.find((g) => g.id === groupId);
    if (!group) return;

    const oldX = group.x ?? computeGroupOriginX(modified, groupId);
    const oldY = group.y ?? computeGroupOriginY(modified, groupId);
    const deltaX = newPosition.x - oldX;
    const deltaY = newPosition.y - oldY;

    for (const node of modified.nodes) {
      if (node.group === groupId) {
        node.x += deltaX;
        node.y += deltaY;
      }
    }

    group.x = newPosition.x;
    group.y = newPosition.y;

    modified.meta.modified = new Date().toISOString();
    modified.agentContext = generateAgentContext(modified);
    await writeDocumentToFile(target, modified);
  }

  emptyDocument(): DiagramDocument {
    return createEmptyDocument();
  }
}

function applyPartialLayout(doc: DiagramDocument): DiagramDocument {
  const layoutResults = computePartialLayout(doc);
  if (layoutResults.length === 0) return doc;

  const modified = structuredClone(doc);
  for (const lr of layoutResults) {
    const node = modified.nodes.find((n) => n.id === lr.nodeId);
    if (node) {
      node.x = lr.x;
      node.y = lr.y;
    }
  }
  return modified;
}

/** Returns the stored group origin X, or computes it from the children's bounding box. */
function computeGroupOriginX(doc: DiagramDocument, groupId: string): number {
  const children = doc.nodes.filter((n) => n.group === groupId);
  if (children.length === 0) return 0;
  return Math.min(...children.map((n) => n.x)) - GROUP_PADDING;
}

/** Returns the stored group origin Y, or computes it from the children's bounding box. */
function computeGroupOriginY(doc: DiagramDocument, groupId: string): number {
  const children = doc.nodes.filter((n) => n.group === groupId);
  if (children.length === 0) return 0;
  return Math.min(...children.map((n) => n.y)) - GROUP_PADDING - GROUP_LABEL_HEIGHT;
}

async function writeDocumentToFile(
  target: vscode.TextDocument,
  doc: DiagramDocument,
): Promise<{ success: boolean; error?: string }> {
  const newText = JSON.stringify(doc, null, 2);
  const edit = new vscode.WorkspaceEdit();
  edit.replace(
    target.uri,
    new vscode.Range(0, 0, target.lineCount, 0),
    newText,
  );
  const applied = await vscode.workspace.applyEdit(edit);
  return applied
    ? { success: true }
    : { success: false, error: 'Failed to apply workspace edit' };
}
