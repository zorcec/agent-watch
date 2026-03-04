import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
} from '@xyflow/react';
import {
  docToFlowNodes,
  docToFlowEdges,
  docToFlowGroupNodes,
  docToFlowTextElements,
  docToFlowImageElements,
  type DiagramNodeData,
  type DiagramEdgeData,
} from '../lib/docToFlow';
import type {
  NodeType,
  SecurityClassification,
  DeploymentEnvironment,
  NodeProperties,
  DiagramDocument,
  DiagramGroup,
  NodeShape,
  NodeColor,
  EdgeStyle,
  ArrowType,
  LayoutDirection,
} from '../../types/DiagramDocument';
import type { VSCodeBridge } from './useVSCodeBridge';

export interface ClipboardNode {
  label: string;
  shape: NodeShape;
  color: NodeColor;
  notes?: string;
}

export interface GraphState {
  nodes: Node<DiagramNodeData>[];
  allNodes: Node[];
  edges: Edge<DiagramEdgeData>[];
  groups: DiagramGroup[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  selectedGroupId: string | null;
  selectedTextElementId: string | null;
  selectedImageElementId: string | null;
  layoutDirection: LayoutDirection;
  layoutPending: boolean;
  searchQuery: string;
  clipboard: ClipboardNode[];
  onNodesChange: OnNodesChange<Node>;
  onEdgesChange: OnEdgesChange<Edge<DiagramEdgeData>>;
  onNodeDragStop: (_event: React.MouseEvent, node: Node, nodes: Node[]) => void;
  onConnect: (connection: Connection) => void;
  onReconnect: (oldEdge: Edge, newConnection: Connection) => void;
  onNodesDelete: (deleted: Node[]) => void;
  onEdgesDelete: (deleted: Edge[]) => void;
  onSelectionChange: (params: { nodes: Node[]; edges: Edge[] }) => void;
  onAddNode: () => void;
  onAddNodeAt: (x: number, y: number, group?: string) => void;
  onAddNote: () => void;
  onAddNoteAt: (x: number, y: number, color?: NodeColor) => void;
  onAddGroup: () => void;
  onAddText: () => void;
  onAddTextAt: (x: number, y: number) => void;
  onAddImage: (src: string, description?: string) => void;
  onAddImageAt: (x: number, y: number, src: string, description?: string) => void;
  onNodeLabelChange: (id: string, label: string) => void;
  onEdgeLabelChange: (id: string, label: string) => void;
  onDuplicateNodeAt: (id: string, x: number, y: number, originalX: number, originalY: number) => void;
  onTextContentChange: (nodeId: string, content: string) => void;
  onUnpinNode: (id: string) => void;
  onRemoveFromGroup: (id: string) => void;
  onUpdateNodeProps: (
    id: string,
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
    },
  ) => void;
  onUpdateEdgeProps: (
    id: string,
    changes: { label?: string; style?: EdgeStyle; arrow?: ArrowType; animated?: boolean; bidirectional?: boolean; protocol?: string; dataTypes?: string[] },
  ) => void;
  onUpdateGroupProps: (id: string, changes: { label?: string; color?: NodeColor; collapsed?: boolean }) => void;
  onUpdateTextElementProps: (id: string, changes: {
    content?: string; fontSize?: number; color?: string; bold?: boolean; italic?: boolean; href?: string; pinned?: boolean;
  }) => void;
  onUpdateImageElementProps: (id: string, changes: {
    src?: string; description?: string; href?: string; pinned?: boolean;
  }) => void;
  onToggleGroupCollapse: (id: string) => void;
  onSortNodes: (direction: LayoutDirection) => void;
  onRequestLayout: (direction?: LayoutDirection) => void;
  onRequestLayoutForce: (direction?: LayoutDirection) => void;
  onSetLayoutDirection: (direction: LayoutDirection) => void;
  onUndo: () => void;
  onRedo: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onSetSearch: (query: string) => void;
  onFitViewDone: () => void;
  onViewMetadata: () => void;
}

export function useGraphState(
  doc: DiagramDocument | null,
  bridge: VSCodeBridge,
): GraphState {
  const [allNodes, setAllNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<DiagramEdgeData>>([]);
  const lastDocHashRef = useRef<string>('');
  const layoutPendingRef = useRef(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedTextElementId, setSelectedTextElementId] = useState<string | null>(null);
  const [selectedImageElementId, setSelectedImageElementId] = useState<string | null>(null);
  const [groups, setGroups] = useState<DiagramGroup[]>([]);
  const [layoutDirection, setLayoutDirection] = useState<LayoutDirection>('TB');
  const [layoutPending, setLayoutPending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [clipboard, setClipboard] = useState<ClipboardNode[]>([]);

  useEffect(() => {
    if (!doc) return;
    const docHash = JSON.stringify(doc);
    if (docHash === lastDocHashRef.current) return;
    lastDocHashRef.current = docHash;

    const groupNodes = docToFlowGroupNodes(doc);
    const regularNodes = docToFlowNodes(doc);
    const textNodes = docToFlowTextElements(doc);
    const imageNodes = docToFlowImageElements(doc);
    // Group nodes first so they render behind regular nodes (lower z-index).
    setAllNodes([...groupNodes, ...regularNodes, ...textNodes, ...imageNodes]);
    setEdges(docToFlowEdges(doc));
    setGroups(doc.groups ?? []);

    if (doc.meta.layoutDirection) {
      setLayoutDirection(doc.meta.layoutDirection);
    }

    // If a layout was pending, signal CanvasPanel to fitView.
    if (layoutPendingRef.current) {
      layoutPendingRef.current = false;
      setLayoutPending(true);
    }
  }, [doc, setAllNodes, setEdges]);

  // Regular (non-group) nodes, used by PropertiesPanel.
  const nodes = useMemo(
    () =>
      allNodes.filter(
        (n): n is Node<DiagramNodeData> => n.type === 'diagramNode',
      ),
    [allNodes],
  );

  const onSelectionChange = useCallback(
    ({ nodes: selNodes, edges: selEdges }: { nodes: Node[]; edges: Edge[] }) => {
      const groupNode = selNodes.find((n) => n.type === 'diagramGroup') ?? null;
      const textNode = selNodes.find((n) => n.type === 'textElementNode') ?? null;
      const imageNode = selNodes.find((n) => n.type === 'imageElementNode') ?? null;
      const regularNodes = selNodes.filter(
        (n) => n.type !== 'diagramGroup' && n.type !== 'textElementNode' && n.type !== 'imageElementNode',
      );

      setSelectedGroupId(groupNode?.id ?? null);
      setSelectedNodeId(regularNodes.length === 1 ? regularNodes[0].id : null);
      setSelectedEdgeId(
        selEdges.length === 1 && regularNodes.length === 0 ? selEdges[0].id : null,
      );
      setSelectedTextElementId(textNode ? textNode.id.replace(/^text-/, '') : null);
      setSelectedImageElementId(imageNode ? imageNode.id.replace(/^image-/, '') : null);
    },
    [],
  );

  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node, nodes: Node[]) => {
      // Helper: find the most up-to-date position of a node by id.
      // Prefers the drag-event `nodes` array (has current positions) over allNodes (may be stale).
      const findNodePosition = (id: string): { x: number; y: number } | null => {
        const fromEvent = nodes.find((n) => n.id === id);
        if (fromEvent) return fromEvent.position;
        const fromState = allNodes.find((n) => n.id === id);
        return fromState ? fromState.position : null;
      };

      const toAbsolute = (n: Node): { x: number; y: number } => {
        let absX = Math.round(n.position.x);
        let absY = Math.round(n.position.y);
        if (n.parentId) {
          const parentPos = findNodePosition(n.parentId);
          if (parentPos) {
            absX += Math.round(parentPos.x);
            absY += Math.round(parentPos.y);
          }
        }
        return { x: absX, y: absY };
      };

      // When only one node is dragged, use the single-node path.
      if (nodes.length <= 1) {
        if (node.type === 'diagramGroup') {
          bridge.postMessage({
            type: 'GROUP_DRAGGED',
            id: node.id,
            position: {
              x: Math.round(node.position.x),
              y: Math.round(node.position.y),
            },
          });
          return;
        }
        if (node.type === 'textElementNode') {
          bridge.postMessage({
            type: 'TEXT_ELEMENT_MOVED',
            id: node.id.replace(/^text-/, ''),
            position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
          });
          return;
        }
        if (node.type === 'imageElementNode') {
          bridge.postMessage({
            type: 'IMAGE_ELEMENT_MOVED',
            id: node.id.replace(/^image-/, ''),
            position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
          });
          return;
        }

        const pos = toAbsolute(node);
        bridge.postMessage({ type: 'NODE_DRAGGED', id: node.id, position: pos });
        return;
      }

      // Multi-node drag: batch all moved regular nodes in a single message.
      const moves: { id: string; position: { x: number; y: number } }[] = [];
      for (const n of nodes) {
        if (n.type === 'diagramGroup') {
          bridge.postMessage({
            type: 'GROUP_DRAGGED',
            id: n.id,
            position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
          });
          continue;
        }
        if (n.type === 'textElementNode') {
          bridge.postMessage({
            type: 'TEXT_ELEMENT_MOVED',
            id: n.id.replace(/^text-/, ''),
            position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
          });
          continue;
        }
        if (n.type === 'imageElementNode') {
          bridge.postMessage({
            type: 'IMAGE_ELEMENT_MOVED',
            id: n.id.replace(/^image-/, ''),
            position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
          });
          continue;
        }
        moves.push({ id: n.id, position: toAbsolute(n) });
      }
      if (moves.length > 0) {
        bridge.postMessage({ type: 'NODES_DRAGGED', moves });
      }
    },
    [bridge, allNodes],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      bridge.postMessage({
        type: 'ADD_EDGE',
        edge: { source: connection.source, target: connection.target },
      });
    },
    [bridge],
  );

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      bridge.postMessage({
        type: 'EDGE_RECONNECTED',
        id: oldEdge.id,
        newSource: newConnection.source,
        newTarget: newConnection.target,
      });
    },
    [bridge],
  );

  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      const nodeIds = deleted
        .filter((n) => n.type !== 'diagramGroup' && n.type !== 'textElementNode' && n.type !== 'imageElementNode')
        .map((n) => n.id);
      const groupIds = deleted
        .filter((n) => n.type === 'diagramGroup')
        .map((n) => n.id);
      const textElementIds = deleted
        .filter((n) => n.type === 'textElementNode')
        .map((n) => n.id.replace(/^text-/, ''));
      const imageElementIds = deleted
        .filter((n) => n.type === 'imageElementNode')
        .map((n) => n.id.replace(/^image-/, ''));

      if (nodeIds.length > 0) {
        bridge.postMessage({ type: 'DELETE_NODES', nodeIds });
      }
      if (groupIds.length > 0) {
        bridge.postMessage({ type: 'DELETE_GROUPS', groupIds });
      }
      if (textElementIds.length > 0) {
        bridge.postMessage({ type: 'DELETE_TEXT_ELEMENTS', elementIds: textElementIds });
      }
      if (imageElementIds.length > 0) {
        bridge.postMessage({ type: 'DELETE_IMAGE_ELEMENTS', elementIds: imageElementIds });
      }
    },
    [bridge],
  );

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      bridge.postMessage({
        type: 'DELETE_EDGES',
        edgeIds: deleted.map((e) => e.id),
      });
    },
    [bridge],
  );

  const onAddNode = useCallback(() => {
    bridge.postMessage({
      type: 'ADD_NODE',
      node: { label: 'New Node', shape: 'rectangle', color: 'default' },
    });
  }, [bridge]);

  const onAddNodeAt = useCallback(
    (x: number, y: number, group?: string) => {
      bridge.postMessage({
        type: 'ADD_NODE',
        node: { label: 'New Node', shape: 'rectangle', color: 'default', x, y, pinned: true, group },
      });
    },
    [bridge],
  );

  const onAddNote = useCallback(() => {
    bridge.postMessage({
      type: 'ADD_NODE',
      node: { label: 'Note', shape: 'note', color: 'yellow' },
    });
  }, [bridge]);

  const onAddNoteAt = useCallback(
    (x: number, y: number, color: NodeColor = 'yellow') => {
      bridge.postMessage({
        type: 'ADD_NODE',
        node: { label: 'Note', shape: 'note', color, x, y, pinned: true },
      });
    },
    [bridge],
  );

  const onAddGroup = useCallback(() => {
    bridge.postMessage({ type: 'ADD_GROUP', label: 'New Group' });
  }, [bridge]);

  const onAddText = useCallback(() => {
    bridge.postMessage({
      type: 'ADD_TEXT_ELEMENT',
      element: { x: 100, y: 100, width: 200, height: 60, content: 'Text' },
    });
  }, [bridge]);

  const onAddTextAt = useCallback(
    (x: number, y: number) => {
      bridge.postMessage({
        type: 'ADD_TEXT_ELEMENT',
        element: { x, y, width: 200, height: 60, content: 'Text' },
      });
    },
    [bridge],
  );

  const onAddImage = useCallback(
    (src: string, description?: string) => {
      bridge.postMessage({
        type: 'ADD_IMAGE_ELEMENT',
        element: { x: 100, y: 100, width: 200, height: 150, src, description },
      });
    },
    [bridge],
  );

  const onAddImageAt = useCallback(
    (x: number, y: number, src: string, description?: string) => {
      bridge.postMessage({
        type: 'ADD_IMAGE_ELEMENT',
        element: { x, y, width: 200, height: 150, src, description },
      });
    },
    [bridge],
  );

  const onTextContentChange = useCallback(
    (nodeId: string, content: string) => {
      bridge.postMessage({
        type: 'UPDATE_TEXT_ELEMENT',
        id: nodeId,
        changes: { content },
      });
    },
    [bridge],
  );

  const onUpdateTextElementProps = useCallback(
    (id: string, changes: { content?: string; fontSize?: number; color?: string; bold?: boolean; italic?: boolean; href?: string; pinned?: boolean }) => {
      bridge.postMessage({ type: 'UPDATE_TEXT_ELEMENT', id, changes });
    },
    [bridge],
  );

  const onUpdateImageElementProps = useCallback(
    (id: string, changes: { src?: string; description?: string; href?: string; pinned?: boolean }) => {
      bridge.postMessage({ type: 'UPDATE_IMAGE_ELEMENT', id, changes });
    },
    [bridge],
  );

  const onNodeLabelChange = useCallback(
    (id: string, label: string) => {
      bridge.postMessage({ type: 'UPDATE_NODE_LABEL', id, label });
    },
    [bridge],
  );

  const onUnpinNode = useCallback(
    (id: string) => {
      bridge.postMessage({ type: 'UPDATE_NODE_PROPS', id, changes: { pinned: false } });
    },
    [bridge],
  );

  const onRemoveFromGroup = useCallback(
    (id: string) => {
      bridge.postMessage({ type: 'UPDATE_NODE_PROPS', id, changes: { group: null } });
    },
    [bridge],
  );

  const onUpdateNodeProps = useCallback(
    (
      id: string,
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
      },
    ) => {
      bridge.postMessage({ type: 'UPDATE_NODE_PROPS', id, changes });
    },
    [bridge],
  );

  const onUpdateEdgeProps = useCallback(
    (
      id: string,
      changes: { label?: string; style?: EdgeStyle; arrow?: ArrowType; animated?: boolean; bidirectional?: boolean; protocol?: string; dataTypes?: string[] },
    ) => {
      bridge.postMessage({ type: 'UPDATE_EDGE_PROPS', id, changes });
    },
    [bridge],
  );

  const onUpdateGroupProps = useCallback(
    (id: string, changes: { label?: string; color?: NodeColor; collapsed?: boolean }) => {
      bridge.postMessage({ type: 'UPDATE_GROUP_PROPS', id, changes });
    },
    [bridge],
  );

  const onToggleGroupCollapse = useCallback(
    (id: string) => {
      const group = groups.find((g) => g.id === id);
      if (!group) return;
      bridge.postMessage({
        type: 'UPDATE_GROUP_PROPS',
        id,
        changes: { collapsed: !group.collapsed },
      });
    },
    [bridge, groups],
  );

  const onSortNodes = useCallback(
    (direction: LayoutDirection) => {
      bridge.postMessage({
        type: 'SORT_NODES',
        direction,
        // When a group is selected, sort nodes inside it; otherwise sort top-level items.
        ...(selectedGroupId ? { groupId: selectedGroupId } : {}),
      });
    },
    [bridge, selectedGroupId],
  );

  const onRequestLayout = useCallback(
    (direction?: LayoutDirection) => {
      layoutPendingRef.current = true;
      bridge.postMessage({ type: 'REQUEST_LAYOUT', direction: direction ?? layoutDirection });
    },
    [bridge, layoutDirection],
  );

  const onRequestLayoutForce = useCallback(
    (direction?: LayoutDirection) => {
      layoutPendingRef.current = true;
      bridge.postMessage({ type: 'REQUEST_LAYOUT_FORCE', direction: direction ?? layoutDirection });
    },
    [bridge, layoutDirection],
  );

  const onSetLayoutDirection = useCallback((direction: LayoutDirection) => {
    setLayoutDirection(direction);
  }, []);

  const onUndo = useCallback(() => {
    bridge.postMessage({ type: 'UNDO' });
  }, [bridge]);

  const onRedo = useCallback(() => {
    bridge.postMessage({ type: 'REDO' });
  }, [bridge]);

  const onCopy = useCallback(() => {
    const selected = nodes.filter((n) => n.selected);
    if (selected.length === 0) return;
    setClipboard(
      selected.map((n) => ({
        label: n.data.label,
        shape: n.data.shape,
        color: n.data.color,
        notes: n.data.notes,
      })),
    );
  }, [nodes]);

  const onPaste = useCallback(() => {
    if (clipboard.length === 0) return;
    bridge.postMessage({
      type: 'ADD_NODES',
      nodes: clipboard.map((n) => ({
        ...n,
        label: `${n.label} (copy)`,
      })),
    });
  }, [bridge, clipboard]);

  const onSetSearch = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const onFitViewDone = useCallback(() => {
    setLayoutPending(false);
  }, []);

  const onEdgeLabelChange = useCallback(
    (id: string, label: string) => {
      bridge.postMessage({ type: 'UPDATE_EDGE_PROPS', id, changes: { label } });
    },
    [bridge],
  );

  const onDuplicateNodeAt = useCallback(
    (id: string, x: number, y: number, originalX: number, originalY: number) => {
      bridge.postMessage({ type: 'DUPLICATE_NODE', id, x, y, originalX, originalY });
    },
    [bridge],
  );

  const onViewMetadata = useCallback(() => {
    bridge.postMessage({ type: 'VIEW_METADATA' });
  }, [bridge]);

  return {
    nodes,
    allNodes,
    edges,
    groups,
    selectedNodeId,
    selectedEdgeId,
    selectedGroupId,
    selectedTextElementId,
    selectedImageElementId,
    layoutDirection,
    layoutPending,
    searchQuery,
    clipboard,
    onNodesChange,
    onEdgesChange,
    onNodeDragStop,
    onConnect,
    onReconnect,
    onNodesDelete,
    onEdgesDelete,
    onSelectionChange,
    onAddNode,
    onAddNodeAt,
    onAddNote,
    onAddNoteAt,
    onAddGroup,
    onAddText,
    onAddTextAt,
    onAddImage,
    onAddImageAt,
    onNodeLabelChange,
    onEdgeLabelChange,
    onDuplicateNodeAt,
    onTextContentChange,
    onUnpinNode,
    onRemoveFromGroup,
    onUpdateNodeProps,
    onUpdateEdgeProps,
    onUpdateGroupProps,
    onUpdateTextElementProps,
    onUpdateImageElementProps,
    onToggleGroupCollapse,
    onSortNodes,
    onRequestLayout,
    onRequestLayoutForce,
    onSetLayoutDirection,
    onUndo,
    onRedo,
    onCopy,
    onPaste,
    onSetSearch,
    onFitViewDone,
    onViewMetadata,
  };
}
