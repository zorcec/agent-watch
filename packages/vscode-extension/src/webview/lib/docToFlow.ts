import type { Node, Edge } from '@xyflow/react';
import type { DiagramDocument, DiagramNode as DocNode, DiagramGroup } from '../../types/DiagramDocument';
import {
  DEFAULT_NODE_WIDTH,
  DEFAULT_NODE_HEIGHT,
  GROUP_PADDING,
  GROUP_LABEL_HEIGHT,
  GROUP_MIN_WIDTH,
  GROUP_MIN_HEIGHT,
  type NodeColor,
} from '../../types/DiagramDocument';

export interface DiagramNodeData extends Record<string, unknown> {
  label: string;
  shape: DocNode['shape'];
  color: DocNode['color'];
  pinned: boolean;
  notes?: string;
  width: number;
  height: number;
}

export interface DiagramEdgeData extends Record<string, unknown> {
  style: 'solid' | 'dashed' | 'dotted';
  arrow: 'normal' | 'arrow' | 'open' | 'none';
}

export interface DiagramGroupNodeData extends Record<string, unknown> {
  label: string;
  color?: NodeColor;
  collapsed?: boolean;
}

/**
 * Computes the bounding box of all child nodes belonging to a group.
 * Returns null if the group has no children.
 */
function computeGroupBounds(
  nodes: DocNode[],
  groupId: string,
): { x: number; y: number; width: number; height: number } | null {
  const children = nodes.filter((n) => n.group === groupId);
  if (children.length === 0) return null;

  const minX = Math.min(...children.map((n) => n.x));
  const minY = Math.min(...children.map((n) => n.y));
  const maxX = Math.max(
    ...children.map((n) => n.x + (n.width > 0 ? n.width : DEFAULT_NODE_WIDTH)),
  );
  const maxY = Math.max(
    ...children.map((n) => n.y + (n.height > 0 ? n.height : DEFAULT_NODE_HEIGHT)),
  );

  return {
    x: minX - GROUP_PADDING,
    y: minY - GROUP_PADDING - GROUP_LABEL_HEIGHT,
    width: Math.max(maxX - minX + 2 * GROUP_PADDING, GROUP_MIN_WIDTH),
    height: Math.max(maxY - minY + 2 * GROUP_PADDING + GROUP_LABEL_HEIGHT, GROUP_MIN_HEIGHT),
  };
}

/**
 * Resolves the absolute top-left position of a group.
 *
 * Always derives from the child nodes' bounding box when the group has children.
 * This guarantees the group rectangle tracks child positions correctly even when
 * children are moved independently after the group was dragged.
 * Falls back to the stored x/y only for empty groups (no children yet).
 */
export function resolveGroupOrigin(
  group: DiagramGroup,
  nodes: DocNode[],
): { x: number; y: number } {
  const bounds = computeGroupBounds(nodes, group.id);
  // Prefer bounds-derived origin so the visual group always wraps its children.
  if (bounds) return { x: bounds.x, y: bounds.y };
  // Empty group: fall back to stored position.
  return { x: group.x ?? 0, y: group.y ?? 0 };
}

export function docToFlowGroupNodes(doc: DiagramDocument): Node<DiagramGroupNodeData>[] {
  if (!doc.groups || doc.groups.length === 0) return [];

  return doc.groups.map((group) => {
    const bounds = computeGroupBounds(doc.nodes, group.id);
    const origin = resolveGroupOrigin(group, doc.nodes);
    const width = bounds?.width ?? GROUP_MIN_WIDTH;
    const height = group.collapsed
      ? GROUP_LABEL_HEIGHT + GROUP_PADDING
      : (bounds?.height ?? GROUP_MIN_HEIGHT);

    return {
      id: group.id,
      type: 'diagramGroup',
      position: { x: origin.x, y: origin.y },
      data: { label: group.label, color: group.color, collapsed: group.collapsed },
      style: { width, height },
      // Group nodes render behind child nodes.
      zIndex: -1,
      selectable: true,
      draggable: true,
    } as Node<DiagramGroupNodeData>;
  });
}

export function docToFlowNodes(doc: DiagramDocument): Node<DiagramNodeData>[] {
  // Build set of collapsed group IDs so child nodes can be hidden.
  const collapsedGroupIds = new Set(
    (doc.groups ?? []).filter((g) => g.collapsed).map((g) => g.id),
  );

  // Pre-compute group origins for coordinate conversion.
  const groupOrigins = new Map<string, { x: number; y: number }>();
  if (doc.groups) {
    for (const group of doc.groups) {
      groupOrigins.set(group.id, resolveGroupOrigin(group, doc.nodes));
    }
  }

  return doc.nodes
    .filter((n) => !n.group || !collapsedGroupIds.has(n.group))
    .map((n) => {
    const w = n.width > 0 ? n.width : DEFAULT_NODE_WIDTH;
    const h = n.height > 0 ? n.height : DEFAULT_NODE_HEIGHT;

    const origin = n.group ? groupOrigins.get(n.group) : undefined;
    // Child nodes use parent-relative positions in React Flow.
    const position = origin
      ? { x: n.x - origin.x, y: n.y - origin.y }
      : { x: n.x ?? 0, y: n.y ?? 0 };

    return {
      id: n.id,
      type: 'diagramNode',
      position,
      data: {
        label: n.label,
        shape: n.shape,
        color: n.color,
        pinned: n.pinned,
        notes: n.notes,
        width: w,
        height: h,
      },
      width: w,
      height: h,
      draggable: true,
      selectable: true,
      // Grouped nodes are children of their group node and render above it.
      ...(n.group ? { parentId: n.group, zIndex: 1 } : {}),
    };
  });
}

export function docToFlowEdges(doc: DiagramDocument): Edge<DiagramEdgeData>[] {
  // Hide edges whose source or target is inside a collapsed group.
  const collapsedGroupIds = new Set(
    (doc.groups ?? []).filter((g) => g.collapsed).map((g) => g.id),
  );
  const hiddenNodeIds = new Set(
    doc.nodes.filter((n) => n.group && collapsedGroupIds.has(n.group)).map((n) => n.id),
  );

  return doc.edges
    .filter((e) => !hiddenNodeIds.has(e.source) && !hiddenNodeIds.has(e.target))
    .map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'diagramEdge',
      label: e.label ?? '',
      animated: e.animated ?? false,
      reconnectable: true,
      data: { style: e.style, arrow: e.arrow },
    }));
}
