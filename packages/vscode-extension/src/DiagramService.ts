import * as vscode from 'vscode';
import * as nodeFs from 'fs';
import type { DiagramDocument, LayoutDirection, TextElement, ImageElement } from './types/DiagramDocument';
import { GROUP_PADDING, GROUP_LABEL_HEIGHT } from './types/DiagramDocument';
import type { SemanticOp } from './types/operations';
import { applyOps, createEmptyDocument } from './lib/operations';
import { computePartialLayout, computeFullLayout, computeForcedLayout, DEFAULT_LAYOUT_CONFIG } from './lib/layoutEngine';
import type { LayoutConfig } from './lib/layoutEngine';
import { generateAgentContext } from './lib/agentContext';
import { buildDocumentSvg } from './lib/exporters';
import { extractDiagramFromSvg } from './lib/svgMetadata';
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
    if (this.undoStack.length === 0) return;
    const state = this.resolveDocument(doc);
    if (!state) return;
    const { target, current } = state;

    const previous = this.undoStack.pop()!;
    this.redoStack.push(structuredClone(current));
    await writeDocumentToFile(target, previous);
  }

  async redo(doc?: vscode.TextDocument): Promise<void> {
    if (this.redoStack.length === 0) return;
    const state = this.resolveDocument(doc);
    if (!state) return;
    const { target, current } = state;

    const next = this.redoStack.pop()!;
    this.undoStack.push(structuredClone(current));
    await writeDocumentToFile(target, next);
  }

  parseDocument(doc?: vscode.TextDocument): DiagramDocument | null {
    const target = doc ?? this.activeDocument;
    if (!target) return null;
    try {
      const text = target.getText();
      // SVG files embed the JSON inside <metadata>; extract it.
      if (target.uri.fsPath.endsWith('.svg')) {
        const json = extractDiagramFromSvg(text);
        return json ? (JSON.parse(json) as DiagramDocument) : null;
      }
      return JSON.parse(text) as DiagramDocument;
    } catch {
      return null;
    }
  }

  /**
   * Resolves target document and parses its content in one step.
   * Returns null when no document is active or the document cannot be parsed.
   */
  private resolveDocument(
    doc?: vscode.TextDocument,
  ): { target: vscode.TextDocument; current: DiagramDocument } | null {
    const target = doc ?? this.activeDocument;
    if (!target) return null;
    const current = this.parseDocument(target);
    if (!current) return null;
    return { target, current };
  }

  async applySemanticOps(
    ops: SemanticOp[],
    doc?: vscode.TextDocument,
  ): Promise<{ success: boolean; error?: string }> {
    const state = this.resolveDocument(doc);
    if (!state) return { success: false, error: 'No active diagram document' };
    const { target, current } = state;

    const result = applyOps(current, ops, () => nanoid(8));
    if (!result.success || !result.document) {
      return { success: false, error: result.error };
    }

    let modified = result.document;
    // Skip partial layout after sort_nodes — sort has already positioned all nodes explicitly.
    const hasSortOp = ops.some((op) => op.op === 'sort_nodes');
    if (!hasSortOp) {
      modified = applyPartialLayout(modified);
    }

    this.stampModified(modified);
    this.recordHistory(current);
    return writeDocumentToFile(target, modified);
  }

  async autoLayoutAll(doc?: vscode.TextDocument, direction?: LayoutDirection): Promise<void> {
    return this.applyLayout(doc, direction, false);
  }

  /** Force auto-layout — repositions ALL nodes regardless of pinned status. */
  async autoLayoutForce(doc?: vscode.TextDocument, direction?: LayoutDirection): Promise<void> {
    return this.applyLayout(doc, direction, true);
  }

  private async applyLayout(
    doc: vscode.TextDocument | undefined,
    direction: LayoutDirection | undefined,
    force: boolean,
  ): Promise<void> {
    const state = this.resolveDocument(doc);
    if (!state) return;
    const { target, current } = state;

    const config: LayoutConfig = {
      ...DEFAULT_LAYOUT_CONFIG,
      rankdir: direction ?? current.meta.layoutDirection ?? 'TB',
    };
    const resetDoc = structuredClone(current);
    resetDoc.meta.layoutDirection = config.rankdir as LayoutDirection;

    for (const node of resetDoc.nodes) {
      if (force || !node.pinned) {
        node.x = 0;
        node.y = 0;
      }
      if (force) node.pinned = false;
    }

    const layoutFn = force ? computeForcedLayout : computeFullLayout;
    for (const lr of layoutFn(resetDoc, config)) {
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
    const state = this.resolveDocument(doc);
    if (!state) return;
    const { target, current } = state;
    await this.applySemanticOps(
      [{ op: 'sort_nodes', direction: current.meta.layoutDirection ?? 'TB', groupId }],
      target,
    );
  }

  /**
   * Moves multiple nodes to explicit positions in a single write.
   * Used for batch drag of a multi-node selection.
   * When a moved node belongs to a group, the group's stored x/y is cleared so
   * that the group origin is always re-derived from its children on next render.
   */
  async moveNodes(
    moves: { id: string; position: { x: number; y: number } }[],
    doc?: vscode.TextDocument,
  ): Promise<void> {
    const state = this.resolveDocument(doc);
    if (!state) return;
    const { target, current } = state;

    const modified = structuredClone(current);
    const affectedGroupIds = new Set<string>();

    for (const { id, position } of moves) {
      const node = modified.nodes.find((n) => n.id === id);
      if (!node) continue;
      node.x = position.x;
      node.y = position.y;
      node.pinned = true;
      if (node.group) affectedGroupIds.add(node.group);
    }

    // Clear stored group origin so group visuals always re-derive from children.
    for (const groupId of affectedGroupIds) {
      const group = modified.groups?.find((g) => g.id === groupId);
      if (group) {
        delete group.x;
        delete group.y;
      }
    }

    this.stampModified(modified);
    await writeDocumentToFile(target, modified);
  }

  /**
   * Moves a node to an explicit position, bypassing the pinned check.
   * This is used for user-initiated drags (where even a pinned node can be repositioned).
   * Sets `pinned = true` so the auto-layout won't displace it afterwards.
   * When the node belongs to a group, the group's stored x/y is cleared so
   * that the group origin is always re-derived from its children on next render.
   */
  async moveNode(
    id: string,
    position: { x: number; y: number },
    doc?: vscode.TextDocument,
  ): Promise<void> {
    const state = this.resolveDocument(doc);
    if (!state) return;
    const { target, current } = state;

    const modified = structuredClone(current);
    const node = modified.nodes.find((n) => n.id === id);
    if (!node) return;

    node.x = position.x;
    node.y = position.y;
    node.pinned = true;

    // Clear stored group origin so group visuals always re-derive from children.
    if (node.group) {
      const group = modified.groups?.find((g) => g.id === node.group);
      if (group) {
        delete group.x;
        delete group.y;
      }
    }

    this.stampModified(modified);
    await writeDocumentToFile(target, modified);
  }

  /**
   * G4: Duplicates a node at the given drop position (x, y) and restores the
   * original node to its pre-drag position (originalX, originalY).
   * The new node is a deep copy of the original with a fresh nanoid.
   */
  async duplicateNode(
    id: string,
    x: number,
    y: number,
    originalX: number,
    originalY: number,
    doc?: vscode.TextDocument,
  ): Promise<void> {
    const state = this.resolveDocument(doc);
    if (!state) return;
    const { target, current } = state;

    const modified = structuredClone(current);
    const original = modified.nodes.find((n) => n.id === id);
    if (!original) return;

    // Restore original node to its pre-drag position.
    original.x = originalX;
    original.y = originalY;

    // Create duplicate at the drop position with a new id.
    const { id: _id, ...rest } = original;
    modified.nodes.push({ ...rest, id: nanoid(), x, y, pinned: true });

    this.recordHistory(current);
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
    const state = this.resolveDocument(doc);
    if (!state) return;
    const { target, current } = state;

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
    const state = this.resolveDocument(doc);
    if (!state) return;
    const { target, current } = state;

    const modified = structuredClone(current);
    const edge = modified.edges.find((e) => e.id === id);
    if (!edge) return;

    edge.source = newSource;
    edge.target = newTarget;

    this.stampModified(modified);
    this.recordHistory(current);
    await writeDocumentToFile(target, modified);
  }

  // ---------------------------------------------------------------------------
  // Text elements
  // ---------------------------------------------------------------------------

  async addTextElement(
    element: Omit<TextElement, 'id'>,
    doc?: vscode.TextDocument,
  ): Promise<{ success: boolean; id?: string; error?: string }> {
    const state = this.resolveDocument(doc);
    if (!state) return { success: false, error: 'No active diagram document' };
    const { target, current } = state;

    const modified = structuredClone(current);
    const id = nanoid(8);
    modified.textElements = [...(modified.textElements ?? []), { id, ...element }];
    this.stampModified(modified);
    this.recordHistory(current);
    const result = await writeDocumentToFile(target, modified);
    return result.success ? { success: true, id } : result;
  }

  async updateTextElement(
    id: string,
    changes: Partial<Omit<TextElement, 'id'>>,
    doc?: vscode.TextDocument,
  ): Promise<{ success: boolean; error?: string }> {
    const state = this.resolveDocument(doc);
    if (!state) return { success: false, error: 'No active diagram document' };
    const { target, current } = state;

    const modified = structuredClone(current);
    const el = modified.textElements?.find((e) => e.id === id);
    if (!el) return { success: false, error: `Text element not found: ${id}` };

    Object.assign(el, changes);
    this.stampModified(modified);
    this.recordHistory(current);
    return writeDocumentToFile(target, modified);
  }

  async deleteTextElements(ids: string[], doc?: vscode.TextDocument): Promise<{ success: boolean; error?: string }> {
    const state = this.resolveDocument(doc);
    if (!state) return { success: false, error: 'No active diagram document' };
    const { target, current } = state;

    const modified = structuredClone(current);
    modified.textElements = (modified.textElements ?? []).filter((e) => !ids.includes(e.id));
    this.stampModified(modified);
    this.recordHistory(current);
    return writeDocumentToFile(target, modified);
  }

  // ---------------------------------------------------------------------------
  // Image elements
  // ---------------------------------------------------------------------------

  async addImageElement(
    element: Omit<ImageElement, 'id'>,
    doc?: vscode.TextDocument,
  ): Promise<{ success: boolean; id?: string; error?: string }> {
    const state = this.resolveDocument(doc);
    if (!state) return { success: false, error: 'No active diagram document' };
    const { target, current } = state;

    const modified = structuredClone(current);
    const id = nanoid(8);
    modified.imageElements = [...(modified.imageElements ?? []), { id, ...element }];
    this.stampModified(modified);
    this.recordHistory(current);
    const result = await writeDocumentToFile(target, modified);
    return result.success ? { success: true, id } : result;
  }

  async updateImageElement(
    id: string,
    changes: Partial<Omit<ImageElement, 'id'>>,
    doc?: vscode.TextDocument,
  ): Promise<{ success: boolean; error?: string }> {
    const state = this.resolveDocument(doc);
    if (!state) return { success: false, error: 'No active diagram document' };
    const { target, current } = state;

    const modified = structuredClone(current);
    const el = modified.imageElements?.find((e) => e.id === id);
    if (!el) return { success: false, error: `Image element not found: ${id}` };

    Object.assign(el, changes);
    this.stampModified(modified);
    this.recordHistory(current);
    return writeDocumentToFile(target, modified);
  }

  async deleteImageElements(ids: string[], doc?: vscode.TextDocument): Promise<{ success: boolean; error?: string }> {
    const state = this.resolveDocument(doc);
    if (!state) return { success: false, error: 'No active diagram document' };
    const { target, current } = state;

    const modified = structuredClone(current);
    modified.imageElements = (modified.imageElements ?? []).filter((e) => !ids.includes(e.id));
    this.stampModified(modified);
    this.recordHistory(current);
    return writeDocumentToFile(target, modified);
  }

  /**
   * Persists agent-written notes about this diagram into meta.llmNotes.
   * Call this whenever you discover architectural decisions, constraints, or patterns
   * that should be remembered in future sessions. Pass null to clear the notes.
   */
  async setLlmNotes(notes: string | null, doc?: vscode.TextDocument): Promise<{ success: boolean; error?: string }> {
    const state = this.resolveDocument(doc);
    if (!state) return { success: false, error: 'No active diagram document' };
    const { target, current } = state;

    const modified = structuredClone(current);
    if (notes === null || notes.trim() === '') {
      delete modified.meta.llmNotes;
    } else {
      modified.meta.llmNotes = notes.trim();
    }
    this.stampModified(modified);
    this.recordHistory(current);
    return writeDocumentToFile(target, modified);
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
  // For .diagram.svg files write a visual SVG with the JSON embedded in <metadata>.
  const isSvg = target.uri.fsPath.endsWith('.svg');
  const newText = isSvg ? buildDocumentSvg(doc) : JSON.stringify(doc, null, 2);

  // Write directly to the filesystem using Node.js — most reliable for local files.
  // VS Code detects the change and reloads the text document buffer.
  try {
    const fsPath = target.uri.fsPath;
    nodeFs.writeFileSync(fsPath, newText, 'utf-8');
    return { success: true };
  } catch (err) {
    console.error('[DiagramFlow] writeDocumentToFile native fs failed, using workspace edit:', err);
    // Fallback to VS Code workspace edit + save for virtual filesystems.
    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      target.uri,
      new vscode.Range(0, 0, target.lineCount, 0),
      newText,
    );
    const applied = await vscode.workspace.applyEdit(edit);
    if (!applied) {
      return { success: false, error: 'Failed to apply workspace edit' };
    }
    await target.save();
    return { success: true };
  }
}
