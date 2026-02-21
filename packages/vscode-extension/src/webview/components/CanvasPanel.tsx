import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  MiniMap,
  Controls,
  BackgroundVariant,
  ConnectionMode,
  useReactFlow,
} from '@xyflow/react';
import { DiagramNode } from './DiagramNode';
import { DiagramEdge } from './DiagramEdge';
import { DiagramGroupNode } from './DiagramGroupNode';
import { Toolbar } from './Toolbar';
import { PropertiesPanel } from './PropertiesPanel';
import { SearchBar } from './SearchBar';
import { ShortcutsPanel } from './ShortcutsPanel';
import { PanningHint } from './PanningHint';
import type { GraphState } from '../hooks/useGraphState';

const nodeTypes = { diagramNode: DiagramNode, diagramGroup: DiagramGroupNode };
const edgeTypes = { diagramEdge: DiagramEdge };

const MINIMAP_NODE_COLORS: Record<string, string> = {
  blue: '#4a90d9',
  green: '#4a9a4a',
  red: '#c84040',
  yellow: '#c8a840',
  purple: '#8040c8',
  gray: '#666',
};

type CanvasPanelProps = {
  graph: GraphState;
};

/** Inner component that has access to the ReactFlow instance. */
function CanvasPanelInner({ graph }: CanvasPanelProps) {
  const { fitView } = useReactFlow();
  const [showSearch, setShowSearch] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Fit view whenever a layout request completes.
  useEffect(() => {
    if (graph.layoutPending) {
      // layoutPending becomes false after the doc arrives; schedule fitView immediately.
      const id = requestAnimationFrame(() => {
        fitView({ padding: 0.2 });
        graph.onFitViewDone();
      });
      return () => cancelAnimationFrame(id);
    }
  }, [graph.layoutPending, fitView, graph.onFitViewDone]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        graph.onUndo();
        return;
      }
      if (ctrl && (e.shiftKey && e.key === 'Z') || (ctrl && e.key === 'y')) {
        e.preventDefault();
        graph.onRedo();
        return;
      }
      if (ctrl && e.key === 'c') {
        graph.onCopy();
        return;
      }
      if (ctrl && e.key === 'v') {
        e.preventDefault();
        graph.onPaste();
        return;
      }
      if (ctrl && e.key === 'f') {
        e.preventDefault();
        setShowSearch((v) => !v);
        return;
      }

      if (ctrl) return; // don't override other Ctrl combos

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        graph.onAddNode();
      } else if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        graph.onAddGroup();
      } else if (e.key === 'L') {
        // Shift+L = force layout
        e.preventDefault();
        graph.onRequestLayoutForce();
      } else if (e.key === 'l') {
        e.preventDefault();
        graph.onRequestLayout();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        fitView({ padding: 0.2 });
      } else if (e.key === '?') {
        e.preventDefault();
        setShowShortcuts((v) => !v);
      } else if (e.key === 'Escape') {
        setShowSearch(false);
        setShowShortcuts(false);
      }
    },
    [graph, fitView],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Compute highlighted node IDs from search query.
  const highlightedNodeIds = useMemo(() => {
    if (!graph.searchQuery.trim()) return null;
    const q = graph.searchQuery.toLowerCase();
    return new Set(
      graph.nodes
        .filter((n) => n.data.label.toLowerCase().includes(q))
        .map((n) => n.id),
    );
  }, [graph.searchQuery, graph.nodes]);

  const searchMatchCount = highlightedNodeIds?.size ?? 0;

  const nodesWithCallbacks = useMemo(
    () =>
      graph.allNodes.map((node) => {
        if (node.type === 'diagramGroup') {
          return {
            ...node,
            data: {
              ...node.data,
              onToggleCollapse: graph.onToggleGroupCollapse,
            },
          };
        }
        const highlighted =
          highlightedNodeIds !== null && !highlightedNodeIds.has(node.id);
        return {
          ...node,
          data: {
            ...node.data,
            onLabelChange: graph.onNodeLabelChange,
            onUnpin: graph.onUnpinNode,
          },
          style: {
            ...node.style,
            opacity: highlighted ? 0.25 : 1,
          },
        };
      }),
    [graph.allNodes, graph.onNodeLabelChange, graph.onUnpinNode, graph.onToggleGroupCollapse, highlightedNodeIds],
  );

  // Determine what the PropertiesPanel should display.
  const propertiesPanelInput = useMemo(() => {
    if (graph.selectedGroupId) {
      const group = graph.groups.find((g) => g.id === graph.selectedGroupId);
      if (group) {
        return { kind: 'group' as const, group, onUpdateGroup: graph.onUpdateGroupProps };
      }
    }
    if (graph.selectedNodeId) {
      const node = graph.nodes.find((n) => n.id === graph.selectedNodeId);
      if (node) {
        return {
          kind: 'node' as const,
          node,
          groups: graph.groups,
          onUpdateNode: graph.onUpdateNodeProps,
        };
      }
    }
    if (graph.selectedEdgeId) {
      const edge = graph.edges.find((e) => e.id === graph.selectedEdgeId);
      if (edge) {
        return { kind: 'edge' as const, edge, onUpdateEdge: graph.onUpdateEdgeProps };
      }
    }
    return { kind: 'none' as const };
  }, [
    graph.selectedGroupId,
    graph.selectedNodeId,
    graph.selectedEdgeId,
    graph.groups,
    graph.nodes,
    graph.edges,
    graph.onUpdateNodeProps,
    graph.onUpdateEdgeProps,
    graph.onUpdateGroupProps,
  ]);

  const toolbarProps = {
    onAddNode: graph.onAddNode,
    onAddNote: graph.onAddNote,
    onAddGroup: graph.onAddGroup,
    onSortNodes: graph.onSortNodes,
    onExportSvg: graph.onExportSvg,
    onExportPng: graph.onExportPng,
    onExportMermaid: graph.onExportMermaid,
    onUndo: graph.onUndo,
    onRedo: graph.onRedo,
    onToggleSearch: () => setShowSearch((v) => !v),
    onToggleShortcuts: () => setShowShortcuts((v) => !v),
    layoutDirection: graph.layoutDirection,
    onSetLayoutDirection: graph.onSetLayoutDirection,
    selectedGroupId: graph.selectedGroupId,
  };

  return (
    <div className="canvas-container" data-testid="canvas-container">
      {showSearch && (
        <SearchBar
          query={graph.searchQuery}
          matchCount={searchMatchCount}
          onQueryChange={graph.onSetSearch}
          onClose={() => {
            setShowSearch(false);
            graph.onSetSearch('');
          }}
        />
      )}

      <div className="canvas-main" data-testid="canvas-main">
        <ReactFlow
          nodes={nodesWithCallbacks}
          edges={graph.edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={graph.onNodesChange}
          onEdgesChange={graph.onEdgesChange}
          onConnect={graph.onConnect}
          onReconnect={graph.onReconnect}
          onNodeDragStop={graph.onNodeDragStop}
          onNodesDelete={graph.onNodesDelete}
          onEdgesDelete={graph.onEdgesDelete}
          onSelectionChange={graph.onSelectionChange}
          connectionMode={ConnectionMode.Loose}
          fitView
          defaultEdgeOptions={{ type: 'diagramEdge' }}
          selectionOnDrag
          panOnDrag={[2]}
          panOnScroll
          snapToGrid
          snapGrid={[20, 20]}
          deleteKeyCode={['Backspace', 'Delete']}
          multiSelectionKeyCode="Shift"
          data-testid="react-flow-canvas"
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
          <Toolbar {...toolbarProps} />
          <MiniMap
            nodeColor={(n) =>
              MINIMAP_NODE_COLORS[n.data?.color as string] ?? '#555'
            }
            maskColor="rgba(0,0,0,0.5)"
            pannable
            zoomable
          />
          <Controls showInteractive={false} />

          {/* SVG defs for arrow markers */}
          <svg style={{ position: 'absolute', width: 0, height: 0 }}>
            <defs>
              <marker
                id="diagramflow-arrow"
                markerWidth="10"
                markerHeight="7"
                refX="9"
                refY="3.5"
                orient="auto"
              >
                <polygon points="0 0, 10 3.5, 0 7" fill="var(--rf-edge, #888)" />
              </marker>
            </defs>
          </svg>
        </ReactFlow>

        <PropertiesPanel {...propertiesPanelInput} />
      </div>

      <PanningHint />

      {showShortcuts && (
        <ShortcutsPanel onClose={() => setShowShortcuts(false)} />
      )}
    </div>
  );
}

export function CanvasPanel({ graph }: CanvasPanelProps) {
  return (
    <ReactFlowProvider>
      <CanvasPanelInner graph={graph} />
    </ReactFlowProvider>
  );
}

