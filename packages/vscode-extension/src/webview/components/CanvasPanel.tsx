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
import { Toolbar } from './Toolbar';
import type { GraphState } from '../hooks/useGraphState';

const nodeTypes = { diagramNode: DiagramNode };
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
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        graph.onAddNode();
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
      graph.nodes.map((node) => ({
        ...node,
        data: { ...node.data, onLabelChange: graph.onNodeLabelChange },
      })),
    [graph.nodes, graph.onNodeLabelChange],
  );

  return (
    <ReactFlowProvider>
    <div className="canvas-container" data-testid="canvas-container">
      <Toolbar
        onAddNode={graph.onAddNode}
        onAutoLayout={graph.onRequestLayout}
        onExportSvg={graph.onExportSvg}
        onExportPng={graph.onExportPng}
        onOpenSvg={graph.onOpenSvg}
      />
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
        connectionMode={ConnectionMode.Loose}
        fitView
        defaultEdgeOptions={{ type: 'diagramEdge' }}
        snapToGrid
        snapGrid={[16, 16]}
        deleteKeyCode={['Backspace', 'Delete']}
        multiSelectionKeyCode="Shift"
        data-testid="react-flow-canvas"
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
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
    </div>
    </ReactFlowProvider>
  );
}
