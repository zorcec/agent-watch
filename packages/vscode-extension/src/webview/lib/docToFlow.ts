import type { Node, Edge } from '@xyflow/react';
import type { DiagramDocument, DiagramNode as DocNode } from '../../types/DiagramDocument';
import { DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT } from '../../types/DiagramDocument';

export type DiagramNodeData = {
  label: string;
  shape: DocNode['shape'];
  color: DocNode['color'];
  pinned: boolean;
  notes?: string;
  width: number;
  height: number;
};

export type DiagramEdgeData = {
  style: 'solid' | 'dashed' | 'dotted';
  arrow: 'normal' | 'arrow' | 'open' | 'none';
};

export function docToFlowNodes(doc: DiagramDocument): Node<DiagramNodeData>[] {
  return doc.nodes.map((n) => {
    const w = n.width > 0 ? n.width : DEFAULT_NODE_WIDTH;
    const h = n.height > 0 ? n.height : DEFAULT_NODE_HEIGHT;
    return {
      id: n.id,
      type: 'diagramNode',
      position: { x: n.x ?? 0, y: n.y ?? 0 },
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
    };
  });
}

export function docToFlowEdges(doc: DiagramDocument): Edge<DiagramEdgeData>[] {
  return doc.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'diagramEdge',
    label: e.label ?? '',
    animated: e.animated ?? false,
    data: { style: e.style, arrow: e.arrow },
  }));
}
