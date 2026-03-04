import type { DiagramDocument, NodeShape, NodeColor, EdgeStyle, ArrowType, LayoutDirection, NodeType, SecurityClassification, DeploymentEnvironment, NodeProperties } from '../types/DiagramDocument';

export type WebviewMessage =
  | { type: 'WEBVIEW_READY' }
  | {
      type: 'NODE_DRAGGED';
      id: string;
      position: { x: number; y: number };
    }
  | {
      type: 'NODES_DRAGGED';
      moves: { id: string; position: { x: number; y: number } }[];
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
      node: { label: string; shape?: NodeShape; color?: NodeColor; notes?: string; x?: number; y?: number; group?: string; pinned?: boolean };
    }
  | {
      type: 'ADD_NODES';
      nodes: { label: string; shape?: NodeShape; color?: NodeColor; notes?: string; x?: number; y?: number }[];
    }
  | { type: 'DELETE_NODES'; nodeIds: string[] }
  | {
      /** G4: Duplicate a node at (x, y); restore original to (originalX, originalY). */
      type: 'DUPLICATE_NODE';
      id: string;
      x: number;
      y: number;
      originalX: number;
      originalY: number;
    }
  | {
      type: 'ADD_GROUP';
      label: string;
    }
  | { type: 'DELETE_GROUPS'; groupIds: string[] }
  | {
      type: 'UPDATE_GROUP_PROPS';
      id: string;
      changes: { label?: string; color?: NodeColor; collapsed?: boolean };
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
        pinned?: boolean;
        type?: NodeType;
        tags?: string[];
        properties?: NodeProperties;
        securityClassification?: SecurityClassification;
        deploymentEnvironment?: DeploymentEnvironment;
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
        bidirectional?: boolean;
        protocol?: string;
        dataTypes?: string[];
      };
    }
  | {
      /** Sort nodes array by spatial position in the given flow direction.
       * When groupId is provided, sorts only children of that group.
       * When omitted, sorts top-level nodes and the groups array. */
      type: 'SORT_NODES';
      direction: LayoutDirection;
      /** If set, sort nodes inside this group instead of top-level items. */
      groupId?: string;
    }
  | {
      type: 'EDGE_RECONNECTED';
      id: string;
      newSource: string;
      newTarget: string;
    }
  | {
      /** Normal auto-layout (respects pinned nodes). */
      type: 'REQUEST_LAYOUT';
      direction?: LayoutDirection;
    }
  | {
      /** Force auto-layout — repositions ALL nodes including pinned ones. */
      type: 'REQUEST_LAYOUT_FORCE';
      direction?: LayoutDirection;
    }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | {
      type: 'EXPORT';
      format: 'svg' | 'png' | 'mermaid';
      /** SVG string (for 'svg') or base64-encoded PNG (for 'png') or Mermaid text (for 'mermaid') */
      data: string;
    }
  | { type: 'OPEN_SVG_REQUEST' }
  | { type: 'VIEW_METADATA' }
  // -------------------------------------------------------------------------
  // Text elements
  // -------------------------------------------------------------------------
  | {
      type: 'ADD_TEXT_ELEMENT';
      element: {
        content: string;
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        fontSize?: number;
        color?: string;
        bold?: boolean;
        italic?: boolean;
        href?: string;
      };
    }
  | {
      type: 'UPDATE_TEXT_ELEMENT';
      id: string;
      changes: {
        content?: string;
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        fontSize?: number;
        color?: string;
        bold?: boolean;
        italic?: boolean;
        href?: string;
        pinned?: boolean;
      };
    }
  | { type: 'DELETE_TEXT_ELEMENTS'; elementIds: string[] }
  | {
      type: 'TEXT_ELEMENT_MOVED';
      id: string;
      position: { x: number; y: number };
    }
  | {
      type: 'TEXT_ELEMENT_RESIZED';
      id: string;
      dimensions: { width: number; height: number };
    }
  // -------------------------------------------------------------------------
  // Image elements
  // -------------------------------------------------------------------------
  | {
      type: 'ADD_IMAGE_ELEMENT';
      element: {
        src: string;
        description?: string;
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        href?: string;
      };
    }
  | {
      type: 'UPDATE_IMAGE_ELEMENT';
      id: string;
      changes: {
        src?: string;
        description?: string;
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        href?: string;
        pinned?: boolean;
      };
    }
  | { type: 'DELETE_IMAGE_ELEMENTS'; elementIds: string[] }
  | {
      type: 'IMAGE_ELEMENT_MOVED';
      id: string;
      position: { x: number; y: number };
    }
  | {
      type: 'IMAGE_ELEMENT_RESIZED';
      id: string;
      dimensions: { width: number; height: number };
    };

export type ExtensionMessage =
  | { type: 'DOCUMENT_UPDATED'; doc: DiagramDocument }
  | { type: 'OPEN_SVG_RESULT'; svgContent: string };
