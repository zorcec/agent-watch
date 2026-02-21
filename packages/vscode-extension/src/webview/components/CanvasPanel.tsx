import { useCallback, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  MiniMap,
  Controls,
  BackgroundVariant,
  ConnectionMode,
} from '@xyflow/react';
import { DiagramNode } from './DiagramNode';
import { DiagramEdge } from './DiagramEdge';
import { DiagramGroupNode } from './DiagramGroupNode';
import { Toolbar } from './Toolbar';
import { PropertiesPanel } from './PropertiesPanel';
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

export function CanvasPanel({ graph }: CanvasPanelProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        graph.onAddNode();
      } else if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        graph.onAddGroup();
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        graph.onRequestLayout();
      }
    },
    [graph],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const nodesWithCallbacks = useMemo(
    () =>
      graph.allNodes.map((node) => {
        if (node.type === 'diagramGroup') return node;
        return {
          ...node,
          data: { ...node.data, onLabelChange: graph.onNodeLabelChange },
        };
      }),
    [graph.allNodes, graph.onNodeLabelChange],
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

  return (
    <ReactFlowProvider>
    <div className="canvas-container" data-testid="canvas-container">
      <Toolbar
        onAddNode={graph.onAddNode}
        onAddGroup={graph.onAddGroup}
        onAutoLayout={graph.onRequestLayout}
        onExportSvg={graph.onExportSvg}
        onExportPng={graph.onExportPng}
        onOpenSvg={graph.onOpenSvg}
      />
      <div className="canvas-main" data-testid="canvas-main">
        <ReactFlow
          nodes={nodesWithCallbacks}
          edges={graph.edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={graph.onNodesChange}
          onEdgesChange={graph.onEdgesChange}
          onConnect={graph.onConnect}
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
    </div>
    </ReactFlowProvider>
  );
}
