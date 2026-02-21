import type { DiagramDocument, NodeShape, NodeColor, EdgeStyle, ArrowType } from '../types/DiagramDocument';

export type WebviewMessage =
  | { type: 'WEBVIEW_READY' }
  | {
      type: 'NODE_DRAGGED';
      id: string;
      position: { x: number; y: number };
    }
  | {
      type: 'NODES_DRAGGED';
      moves: Array<{ id: string; position: { x: number; y: number } }>;
    }
  | {
      type: 'GROUP_DRAGGED';
      id: string;
      position: { x: number; y: number };
    }
  | {
      type: 'NODE_RESIZED';
      id: string;
      dimensions: { width: number; height: number };
    }
  | {
      type: 'ADD_NODE';
      node: { label: string; shape?: NodeShape; color?: NodeColor; notes?: string };
    }
  | { type: 'DELETE_NODES'; nodeIds: string[] }
  | {
      type: 'ADD_GROUP';
      label: string;
    }
  | { type: 'DELETE_GROUPS'; groupIds: string[] }
  | {
      type: 'UPDATE_GROUP_PROPS';
      id: string;
      changes: { label?: string; color?: NodeColor };
    }
  | {
      type: 'ADD_EDGE';
      edge: { source: string; target: string; label?: string; style?: EdgeStyle; arrow?: ArrowType; animated?: boolean };
    }
  | { type: 'DELETE_EDGES'; edgeIds: string[] }
  | { type: 'UPDATE_NODE_LABEL'; id: string; label: string }
  | {
      type: 'UPDATE_NODE_PROPS';
      id: string;
      changes: {
        label?: string;
        shape?: NodeShape;
        color?: NodeColor;
        notes?: string;
        group?: string | null;
      };
    }
  | {
      type: 'UPDATE_EDGE_PROPS';
      id: string;
      changes: {
        label?: string;
        style?: EdgeStyle;
        arrow?: ArrowType;
        animated?: boolean;
      };
    }
  | { type: 'REQUEST_LAYOUT' }
  | {
      type: 'EXPORT';
      format: 'svg' | 'png' | 'mermaid';
      /** SVG string (for 'svg') or base64-encoded PNG (for 'png') or Mermaid text (for 'mermaid') */
      data: string;
    }
  | { type: 'OPEN_SVG_REQUEST' };

export type ExtensionMessage =
  | { type: 'DOCUMENT_UPDATED'; doc: DiagramDocument }
  | { type: 'OPEN_SVG_RESULT'; svgContent: string };
