import type {
  DiagramDocument,
  DiagramNode,
  DiagramEdge,
  DiagramGroup,
  LayoutDirection,
} from '../types/DiagramDocument';
import {
  DEFAULT_NODE_WIDTH,
  DEFAULT_NODE_HEIGHT,
  GROUP_PADDING,
  GROUP_LABEL_HEIGHT,
} from '../types/DiagramDocument';
import type { SemanticOp, OpResult } from '../types/operations';
import { validateDiagram } from './SchemaValidator';
import { generateAgentContext } from './agentContext';

export function createEmptyDocument(title = 'Untitled Diagram'): DiagramDocument {
  const now = new Date().toISOString();
  return {
    meta: { version: '1.0', title, created: now, modified: now },
    nodes: [],
    edges: [],
    groups: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

export function applyOps(
  doc: DiagramDocument,
  ops: SemanticOp[],
  generateId: () => string,
): OpResult {
  let modified = structuredClone(doc);

  for (const op of ops) {
    const result = applySingleOp(modified, op, generateId);
    if (!result.success) return result;
    modified = result.document!;
  }

  const validation = validateDiagram(modified);
  if (!validation.valid) {
    return {
      success: false,
      error: `Validation failed: ${validation.errors.join(', ')}`,
    };
  }

  modified.meta.modified = new Date().toISOString();
  modified.agentContext = generateAgentContext(modified);
  return { success: true, document: modified };
}

function applySingleOp(
  doc: DiagramDocument,
  op: SemanticOp,
  generateId: () => string,
): OpResult {
  switch (op.op) {
    case 'add_node':
      return addNode(doc, op.node, generateId);
    case 'remove_node':
      return removeNode(doc, op.id);
    case 'update_node':
      return updateNode(doc, op.id, op.changes);
    case 'sort_nodes':
      return sortNodes(doc, op.direction, op.groupId);
    case 'add_edge':
      return addEdge(doc, op.edge, generateId);
    case 'remove_edge':
      return removeEdge(doc, op.id);
    case 'update_edge':
      return updateEdge(doc, op.id, op.changes);
    case 'add_group':
      return addGroup(doc, op.group, generateId);
    case 'remove_group':
      return removeGroup(doc, op.id);
    case 'update_group':
      return updateGroup(doc, op.id, op.changes);
  }
}

function addNode(
  doc: DiagramDocument,
  partial: Partial<DiagramNode> & { label: string },
  generateId: () => string,
): OpResult {
  const node: DiagramNode = {
    id: generateId(),
    label: partial.label,
    x: partial.x ?? 0,
    y: partial.y ?? 0,
    width: partial.width ?? DEFAULT_NODE_WIDTH,
    height: partial.height ?? DEFAULT_NODE_HEIGHT,
    shape: partial.shape ?? 'rectangle',
    color: partial.color ?? 'default',
    pinned: partial.pinned ?? false,
    notes: partial.notes,
    group: partial.group,
  };

  const modified = structuredClone(doc);
  modified.nodes.push(node);
  return { success: true, document: modified };
}

function removeNode(doc: DiagramDocument, id: string): OpResult {
  const exists = doc.nodes.some((n) => n.id === id);
  if (!exists) {
    return { success: false, error: `Node "${id}" not found` };
  }

  const modified = structuredClone(doc);
  modified.edges = modified.edges.filter(
    (e) => e.source !== id && e.target !== id,
  );
  modified.nodes = modified.nodes.filter((n) => n.id !== id);
  return { success: true, document: modified };
}

function updateNode(
  doc: DiagramDocument,
  id: string,
  changes: Partial<Omit<DiagramNode, 'id'>>,
): OpResult {
  const nodeIndex = doc.nodes.findIndex((n) => n.id === id);
  if (nodeIndex === -1) {
    return { success: false, error: `Node "${id}" not found` };
  }

  const modified = structuredClone(doc);
  const node = modified.nodes[nodeIndex];

  const { x, y, ...safeChanges } = changes;
  if (!node.pinned) {
    if (x !== undefined) node.x = x;
    if (y !== undefined) node.y = y;
  }
  Object.assign(node, safeChanges);

  return { success: true, document: modified };
}

function addEdge(
  doc: DiagramDocument,
  partial: Partial<DiagramEdge> & { source: string; target: string },
  generateId: () => string,
): OpResult {
  const sourceExists = doc.nodes.some((n) => n.id === partial.source);
  if (!sourceExists) {
    return {
      success: false,
      error: `Source node "${partial.source}" not found`,
    };
  }
  const targetExists = doc.nodes.some((n) => n.id === partial.target);
  if (!targetExists) {
    return {
      success: false,
      error: `Target node "${partial.target}" not found`,
    };
  }

  const edge: DiagramEdge = {
    id: generateId(),
    source: partial.source,
    target: partial.target,
    label: partial.label,
    style: partial.style ?? 'solid',
    arrow: partial.arrow ?? 'arrow',
    animated: partial.animated,
  };

  const modified = structuredClone(doc);
  modified.edges.push(edge);
  return { success: true, document: modified };
}

function removeEdge(doc: DiagramDocument, id: string): OpResult {
  const exists = doc.edges.some((e) => e.id === id);
  if (!exists) {
    return { success: false, error: `Edge "${id}" not found` };
  }

  const modified = structuredClone(doc);
  modified.edges = modified.edges.filter((e) => e.id !== id);
  return { success: true, document: modified };
}

function updateEdge(
  doc: DiagramDocument,
  id: string,
  changes: Partial<Omit<DiagramEdge, 'id'>>,
): OpResult {
  const edgeIndex = doc.edges.findIndex((e) => e.id === id);
  if (edgeIndex === -1) {
    return { success: false, error: `Edge "${id}" not found` };
  }

  if (changes.source) {
    const sourceExists = doc.nodes.some((n) => n.id === changes.source);
    if (!sourceExists) {
      return {
        success: false,
        error: `Source node "${changes.source}" not found`,
      };
    }
  }
  if (changes.target) {
    const targetExists = doc.nodes.some((n) => n.id === changes.target);
    if (!targetExists) {
      return {
        success: false,
        error: `Target node "${changes.target}" not found`,
      };
    }
  }

  const modified = structuredClone(doc);
  Object.assign(modified.edges[edgeIndex], changes);
  return { success: true, document: modified };
}

// ---------------------------------------------------------------------------
// Group operations
// ---------------------------------------------------------------------------

function addGroup(
  doc: DiagramDocument,
  partial: Partial<DiagramGroup> & { label: string },
  generateId: () => string,
): OpResult {
  const group: DiagramGroup = {
    id: partial.id ?? generateId(),
    label: partial.label,
    ...(partial.color ? { color: partial.color } : {}),
    ...(partial.x !== undefined ? { x: partial.x } : {}),
    ...(partial.y !== undefined ? { y: partial.y } : {}),
  };

  const modified = structuredClone(doc);
  if (!modified.groups) modified.groups = [];
  modified.groups.push(group);
  return { success: true, document: modified };
}

function removeGroup(doc: DiagramDocument, id: string): OpResult {
  const exists = doc.groups?.some((g) => g.id === id);
  if (!exists) {
    return { success: false, error: `Group "${id}" not found` };
  }

  const modified = structuredClone(doc);
  modified.groups = modified.groups!.filter((g) => g.id !== id);
  // Detach nodes from the removed group.
  for (const node of modified.nodes) {
    if (node.group === id) {
      node.group = undefined;
    }
  }
  return { success: true, document: modified };
}

function updateGroup(
  doc: DiagramDocument,
  id: string,
  changes: Partial<Omit<DiagramGroup, 'id'>>,
): OpResult {
  const groupIndex = doc.groups?.findIndex((g) => g.id === id) ?? -1;
  if (groupIndex === -1) {
    return { success: false, error: `Group "${id}" not found` };
  }

  const modified = structuredClone(doc);
  Object.assign(modified.groups![groupIndex], changes);
  return { success: true, document: modified };
}

// ---------------------------------------------------------------------------
// Node sorting by spatial position
// ---------------------------------------------------------------------------

/**
 * Sorts groups by their canvas position (using stored x/y or child bounding box).
 * Pure function — returns a new array without mutating the input.
 */
export function sortGroupsByPosition(
  groups: readonly DiagramGroup[],
  nodes: readonly DiagramNode[],
  direction: LayoutDirection,
): DiagramGroup[] {
  const sorted = [...groups];

  const getOrigin = (g: DiagramGroup) => {
    if (g.x !== undefined && g.y !== undefined) return { x: g.x, y: g.y };
    const children = nodes.filter((n) => n.group === g.id);
    if (children.length === 0) return { x: 0, y: 0 };
    return {
      x: Math.min(...children.map((n) => n.x)) - GROUP_PADDING,
      y: Math.min(...children.map((n) => n.y)) - GROUP_PADDING - GROUP_LABEL_HEIGHT,
    };
  };

  sorted.sort((a, b) => {
    const oa = getOrigin(a);
    const ob = getOrigin(b);
    switch (direction) {
      case 'TB':
        return oa.y !== ob.y ? oa.y - ob.y : oa.x - ob.x;
      case 'BT':
        return oa.y !== ob.y ? ob.y - oa.y : oa.x - ob.x;
      case 'LR':
        return oa.x !== ob.x ? oa.x - ob.x : oa.y - ob.y;
      case 'RL':
        return oa.x !== ob.x ? ob.x - oa.x : oa.y - ob.y;
    }
  });

  return sorted;
}

/**
 * Sorts nodes by their canvas position so the array order reflects the visual
 * reading order of the diagram.
 *
 * - TB (top→bottom): sorted by y asc, then x asc as tiebreaker
 * - BT (bottom→top): sorted by y desc, then x asc as tiebreaker
 * - LR (left→right): sorted by x asc, then y asc as tiebreaker
 * - RL (right→left): sorted by x desc, then y asc as tiebreaker
 *
 * Pure function — returns a new array without mutating the input.
 */
export function sortNodesByPosition(
  nodes: readonly DiagramNode[],
  direction: LayoutDirection,
): DiagramNode[] {
  const sorted = [...nodes];

  sorted.sort((a, b) => {
    switch (direction) {
      case 'TB':
        return a.y !== b.y ? a.y - b.y : a.x - b.x;
      case 'BT':
        return a.y !== b.y ? b.y - a.y : a.x - b.x;
      case 'LR':
        return a.x !== b.x ? a.x - b.x : a.y - b.y;
      case 'RL':
        return a.x !== b.x ? b.x - a.x : a.y - b.y;
    }
  });

  return sorted;
}

function sortNodes(
  doc: DiagramDocument,
  direction: LayoutDirection,
  groupId?: string,
): OpResult {
  const modified = structuredClone(doc);

  if (groupId) {
    // Sort only nodes inside the specified group; leave other nodes in place.
    const inside = modified.nodes.filter((n) => n.group === groupId);
    const outside = modified.nodes.filter((n) => n.group !== groupId);
    modified.nodes = [...outside, ...sortNodesByPosition(inside, direction)];
  } else {
    // Sort top-level (ungrouped) nodes by position; keep grouped nodes in place.
    // Also sort the groups array itself by position.
    const topLevel = modified.nodes.filter((n) => !n.group);
    const grouped = modified.nodes.filter((n) => n.group);
    modified.nodes = [...sortNodesByPosition(topLevel, direction), ...grouped];
    modified.groups = sortGroupsByPosition(modified.groups ?? [], modified.nodes, direction);
  }

  return { success: true, document: modified };
}
