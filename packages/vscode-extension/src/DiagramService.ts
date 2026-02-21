import * as vscode from 'vscode';
import type { DiagramDocument, LayoutDirection } from './types/DiagramDocument';
import { GROUP_PADDING, GROUP_LABEL_HEIGHT } from './types/DiagramDocument';
import type { SemanticOp } from './types/operations';
import { applyOps, createEmptyDocument } from './lib/operations';
import { computePartialLayout, computeFullLayout, computeForcedLayout, DEFAULT_LAYOUT_CONFIG } from './lib/layoutEngine';
import type { LayoutConfig } from './lib/layoutEngine';
import { generateAgentContext } from './lib/agentContext';
import { nanoid } from 'nanoid';

const HISTORY_MAX = 50;

export class DiagramService {
  private activeDocument: vscode.TextDocument | null = null;
  private undoStack: DiagramDocument[] = [];
  private redoStack: DiagramDocument[] = [];

  setActiveDocument(doc: vscode.TextDocument | null): void {
    this.activeDocument = doc;
    // Clear history when switching to a different document.
    this.undoStack = [];
    this.redoStack = [];
  }

  getActiveDocument(): vscode.TextDocument | null {
    return this.activeDocument;
  }

  /** Push the current document state to the undo stack before a write. */
  private recordHistory(current: DiagramDocument): void {
    this.undoStack.push(structuredClone(current));
    if (this.undoStack.length > HISTORY_MAX) {
      this.undoStack.shift();
    }
    // Any new action clears the redo stack.
    this.redoStack = [];
  }

  async undo(doc?: vscode.TextDocument): Promise<void> {
    const target = doc ?? this.activeDocument;
    if (!target || this.undoStack.length === 0) return;

    const current = this.parseDocument(target);
    if (!current) return;

    const previous = this.undoStack.pop()!;
    this.redoStack.push(structuredClone(current));
    await writeDocumentToFile(target, previous);
  }

  async redo(doc?: vscode.TextDocument): Promise<void> {
    const target = doc ?? this.activeDocument;
    if (!target || this.redoStack.length === 0) return;

    const current = this.parseDocument(target);
    if (!current) return;

    const next = this.redoStack.pop()!;
    this.undoStack.push(structuredClone(current));
    await writeDocumentToFile(target, next);
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

    this.recordHistory(current);
    return writeDocumentToFile(target, modified);
  }

  async autoLayoutAll(doc?: vscode.TextDocument, direction?: LayoutDirection): Promise<void> {
    const target = doc ?? this.activeDocument;
    if (!target) return;

    const current = this.parseDocument(target);
    if (!current) return;

    const config: LayoutConfig = { ...DEFAULT_LAYOUT_CONFIG, rankdir: direction ?? current.meta.layoutDirection ?? 'TB' };
    const resetDoc = structuredClone(current);
    // Persist direction choice in meta.
    resetDoc.meta.layoutDirection = config.rankdir as LayoutDirection;
    // Only reset positions for non-pinned nodes; pinned nodes stay where the user placed them.
    for (const node of resetDoc.nodes) {
      if (!node.pinned) {
        node.x = 0;
        node.y = 0;
      }
    }

    const layoutResults = computeFullLayout(resetDoc, config);
    for (const lr of layoutResults) {
      const node = resetDoc.nodes.find((n) => n.id === lr.nodeId);
      if (node) {
        node.x = lr.x;
        node.y = lr.y;
      }
    }

    this.stampModified(resetDoc);
    this.recordHistory(current);
    await writeDocumentToFile(target, resetDoc);
  }

  /** Force auto-layout — repositions ALL nodes regardless of pinned status. */
  async autoLayoutForce(doc?: vscode.TextDocument, direction?: LayoutDirection): Promise<void> {
    const target = doc ?? this.activeDocument;
    if (!target) return;

    const current = this.parseDocument(target);
    if (!current) return;

    const config: LayoutConfig = { ...DEFAULT_LAYOUT_CONFIG, rankdir: direction ?? current.meta.layoutDirection ?? 'TB' };
    const resetDoc = structuredClone(current);
    resetDoc.meta.layoutDirection = config.rankdir as LayoutDirection;
    // Reset ALL node positions (including pinned) for a fresh layout.
    for (const node of resetDoc.nodes) {
      node.x = 0;
      node.y = 0;
      node.pinned = false;
    }

    const layoutResults = computeForcedLayout(resetDoc, config);
    for (const lr of layoutResults) {
      const node = resetDoc.nodes.find((n) => n.id === lr.nodeId);
      if (node) {
        node.x = lr.x;
        node.y = lr.y;
      }
    }

    this.stampModified(resetDoc);
    this.recordHistory(current);
    await writeDocumentToFile(target, resetDoc);
  }

  /**
   * Sorts top-level nodes and groups by their canvas position in the document's
   * current layout direction. Grouped nodes are not reordered; use groupId for
   * scoped sorting. Callable from VS Code commands (no webview interaction needed).
   */
  async sortNodes(groupId?: string, doc?: vscode.TextDocument): Promise<void> {
    const target = doc ?? this.activeDocument;
    if (!target) return;

    const current = this.parseDocument(target);
    if (!current) return;

    const direction = current.meta.layoutDirection ?? 'TB';
    await this.applySemanticOps([{ op: 'sort_nodes', direction, groupId }], target);
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

    this.stampModified(modified);
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

    this.stampModified(modified);
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

    const origin = computeGroupOrigin(modified, groupId);
    const deltaX = newPosition.x - (group.x ?? origin.x);
    const deltaY = newPosition.y - (group.y ?? origin.y);

    for (const node of modified.nodes) {
      if (node.group === groupId) {
        node.x += deltaX;
        node.y += deltaY;
      }
    }

    group.x = newPosition.x;
    group.y = newPosition.y;

    this.stampModified(modified);
    await writeDocumentToFile(target, modified);
  }

  /** Reconnects an existing edge to a new source/target. */
  async reconnectEdge(
    id: string,
    newSource: string,
    newTarget: string,
    doc?: vscode.TextDocument,
  ): Promise<void> {
    const target = doc ?? this.activeDocument;
    if (!target) return;

    const current = this.parseDocument(target);
    if (!current) return;

    const modified = structuredClone(current);
    const edge = modified.edges.find((e) => e.id === id);
    if (!edge) return;

    edge.source = newSource;
    edge.target = newTarget;

    this.stampModified(modified);
    this.recordHistory(current);
    await writeDocumentToFile(target, modified);
  }

  emptyDocument(): DiagramDocument {
    return createEmptyDocument();
  }

  /** Stamps `modified` timestamp and refreshes agentContext on a cloned document. */
  private stampModified(doc: DiagramDocument): void {
    doc.meta.modified = new Date().toISOString();
    doc.agentContext = generateAgentContext(doc);
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

/** Computes the group origin {x,y} from child node positions and group padding. */
function computeGroupOrigin(doc: DiagramDocument, groupId: string): { x: number; y: number } {
  const children = doc.nodes.filter((n) => n.group === groupId);
  if (children.length === 0) return { x: 0, y: 0 };
  return {
    x: Math.min(...children.map((n) => n.x)) - GROUP_PADDING,
    y: Math.min(...children.map((n) => n.y)) - GROUP_PADDING - GROUP_LABEL_HEIGHT,
  };
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
