import type {
  DiagramDocument,
  DiagramNode,
  DiagramEdge,
  DiagramGroup,
  NodeShape,
  EdgeStyle,
  ArrowType,
  NodeColor,
  LayoutDirection,
} from '../types/DiagramDocument';

export type SemanticOp =
  | { op: 'add_node'; node: Partial<DiagramNode> & { label: string } }
  | { op: 'remove_node'; id: string }
  | {
      op: 'update_node';
      id: string;
      changes: Partial<Omit<DiagramNode, 'id'>>;
    }
  | { op: 'sort_nodes'; direction: LayoutDirection; groupId?: string }
  | {
      op: 'add_edge';
      edge: Partial<DiagramEdge> & { source: string; target: string };
    }
  | { op: 'remove_edge'; id: string }
  | {
      op: 'update_edge';
      id: string;
      changes: Partial<Omit<DiagramEdge, 'id'>>;
    }
  | { op: 'add_group'; group: Partial<DiagramGroup> & { label: string } }
  | { op: 'remove_group'; id: string }
  | {
      op: 'update_group';
      id: string;
      changes: Partial<Omit<DiagramGroup, 'id'>>;
    };

export interface OpResult {
  success: boolean;
  document?: DiagramDocument;
  error?: string;
}

export { type DiagramDocument, type DiagramNode, type DiagramEdge, type DiagramGroup };
export { type NodeShape, type EdgeStyle, type ArrowType, type NodeColor };
