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
  type DiagramNodeData,
  type DiagramEdgeData,
  type DiagramGroupNodeData,
} from '../lib/docToFlow';
import { buildExportSvg, rasterizeSvgToPng } from '../lib/exportSvg';
import { exportToMermaid } from '../../lib/exporters';
import type {
  DiagramDocument,
  DiagramGroup,
  NodeShape,
  NodeColor,
  EdgeStyle,
  ArrowType,
  LayoutDirection,
} from '../../types/DiagramDocument';
import type { VSCodeBridge } from './useVSCodeBridge';

export type ClipboardNode = {
  label: string;
  shape: NodeShape;
  color: NodeColor;
  notes?: string;
};

export type GraphState = {
  nodes: Node<DiagramNodeData>[];
  allNodes: Node[];
  edges: Edge<DiagramEdgeData>[];
  groups: DiagramGroup[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  selectedGroupId: string | null;
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
  onAddNote: () => void;
  onAddGroup: () => void;
  onNodeLabelChange: (id: string, label: string) => void;
  onUnpinNode: (id: string) => void;
  onUpdateNodeProps: (
    id: string,
    changes: {
      label?: string;
      shape?: NodeShape;
      color?: NodeColor;
      notes?: string;
      group?: string | null;
      pinned?: boolean;
    },
  ) => void;
  onUpdateEdgeProps: (
    id: string,
    changes: { label?: string; style?: EdgeStyle; arrow?: ArrowType; animated?: boolean },
  ) => void;
  onUpdateGroupProps: (id: string, changes: { label?: string; color?: NodeColor; collapsed?: boolean }) => void;
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
  onExportSvg: () => void;
  onExportPng: () => void;
  onExportMermaid: () => void;
  onOpenSvg: () => void;
};

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
    // Group nodes first so they render behind regular nodes (lower z-index).
    setAllNodes([...groupNodes, ...regularNodes]);
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
      const regularNodes = selNodes.filter((n) => n.type !== 'diagramGroup');

      setSelectedGroupId(groupNode?.id ?? null);
      setSelectedNodeId(regularNodes.length === 1 ? regularNodes[0].id : null);
      setSelectedEdgeId(
        selEdges.length === 1 && regularNodes.length === 0 ? selEdges[0].id : null,
      );
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

        const pos = toAbsolute(node);
        bridge.postMessage({ type: 'NODE_DRAGGED', id: node.id, position: pos });
        return;
      }

      // Multi-node drag: batch all moved regular nodes in a single message.
      const moves: Array<{ id: string; position: { x: number; y: number } }> = [];
      for (const n of nodes) {
        if (n.type === 'diagramGroup') {
          // Persist each dragged group individually.
          bridge.postMessage({
            type: 'GROUP_DRAGGED',
            id: n.id,
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
        .filter((n) => n.type !== 'diagramGroup')
        .map((n) => n.id);
      const groupIds = deleted
        .filter((n) => n.type === 'diagramGroup')
        .map((n) => n.id);

      if (nodeIds.length > 0) {
        bridge.postMessage({ type: 'DELETE_NODES', nodeIds });
      }
      if (groupIds.length > 0) {
        bridge.postMessage({ type: 'DELETE_GROUPS', groupIds });
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

  const onAddNote = useCallback(() => {
    bridge.postMessage({
      type: 'ADD_NODE',
      node: { label: 'Note', shape: 'note', color: 'yellow' },
    });
  }, [bridge]);

  const onAddGroup = useCallback(() => {
    bridge.postMessage({ type: 'ADD_GROUP', label: 'New Group' });
  }, [bridge]);

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
      },
    ) => {
      bridge.postMessage({ type: 'UPDATE_NODE_PROPS', id, changes });
    },
    [bridge],
  );

  const onUpdateEdgeProps = useCallback(
    (
      id: string,
      changes: { label?: string; style?: EdgeStyle; arrow?: ArrowType; animated?: boolean },
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

  const onExportSvg = useCallback(() => {
    const svgData = buildExportSvg(doc);
    if (!svgData) return;
    bridge.postMessage({ type: 'EXPORT', format: 'svg', data: svgData });
  }, [bridge, doc]);

  const onExportPng = useCallback(() => {
    const svgData = buildExportSvg(doc);
    if (!svgData) return;
    rasterizeSvgToPng(svgData, (base64) => {
      bridge.postMessage({ type: 'EXPORT', format: 'png', data: base64 });
    });
  }, [bridge, doc]);

  const onExportMermaid = useCallback(() => {
    if (!doc) return;
    const mermaidText = exportToMermaid(doc);
    bridge.postMessage({ type: 'EXPORT', format: 'mermaid', data: mermaidText });
  }, [bridge, doc]);

  const onOpenSvg = useCallback(() => {
    bridge.postMessage({ type: 'OPEN_SVG_REQUEST' });
  }, [bridge]);

  return {
    nodes,
    allNodes,
    edges,
    groups,
    selectedNodeId,
    selectedEdgeId,
    selectedGroupId,
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
    onAddNote,
    onAddGroup,
    onNodeLabelChange,
    onUnpinNode,
    onUpdateNodeProps,
    onUpdateEdgeProps,
    onUpdateGroupProps,
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
    onExportSvg,
    onExportPng,
    onExportMermaid,
    onOpenSvg,
  };
}
