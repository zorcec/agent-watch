import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import type { Node as RFNode, Edge as RFEdge } from '@xyflow/react';
import { DiagramNode } from './DiagramNode';
import { DiagramEdge } from './DiagramEdge';
import { DiagramGroupNode } from './DiagramGroupNode';
import { TextElementNode } from './TextElementNode';
import { ImageElementNode } from './ImageElementNode';
import { Toolbar, type ToolboxMode } from './Toolbar';
import { PropertiesPanel } from './PropertiesPanel';
import { SearchBar } from './SearchBar';
import { ShortcutsPanel } from './ShortcutsPanel';
import { PanningHint } from './PanningHint';
import { NoteColorPicker } from './NoteColorPicker';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { ImageInputPanel } from './ImageInputPanel';
import type { GraphState } from '../hooks/useGraphState';
import type { NodeColor } from '../../types/DiagramDocument';
import type { DiagramEdgeData } from '../lib/docToFlow';

const nodeTypes = {
  diagramNode: DiagramNode,
  diagramGroup: DiagramGroupNode,
  textElementNode: TextElementNode,
  imageElementNode: ImageElementNode,
};
const edgeTypes = { diagramEdge: DiagramEdge };

const MINIMAP_NODE_COLORS: Record<string, string> = {
  blue: '#4a90d9',
  green: '#4a9a4a',
  red: '#c84040',
  yellow: '#c8a840',
  purple: '#8040c8',
  gray: '#666',
};

interface CanvasPanelProps {
  graph: GraphState;
}

/** Inner component that has access to the ReactFlow instance. */
function CanvasPanelInner({ graph }: CanvasPanelProps) {
  const { fitView, screenToFlowPosition } = useReactFlow();
  const [showSearch, setShowSearch] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [toolboxMode, setToolboxMode] = useState<ToolboxMode>(null);
  const pendingImageDataRef = useRef<{ src: string; description?: string } | null>(null);
  // G3: Note color selected before placement
  const [pendingNoteColor, setPendingNoteColor] = useState<NodeColor>('yellow');
  // G9: Show ImageInputPanel instead of window.prompt
  const [showImagePanel, setShowImagePanel] = useState(false);
  // G5/G6: Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  // G4: Alt+drag to duplicate — track original position before drag
  const altDragOriginalPosRef = useRef<{ id: string; x: number; y: number } | null>(null);

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

  // Handle toolbox mode changes — G9: image tool shows inline panel instead of window.prompt.
  const handleSetToolboxMode = useCallback((mode: ToolboxMode) => {
    if (mode === 'image') {
      pendingImageDataRef.current = null;
      setToolboxMode('image');
      setShowImagePanel(true);
    } else {
      pendingImageDataRef.current = null;
      setShowImagePanel(false);
      setToolboxMode(mode);
    }
  }, []);

  // G9: Confirmed from ImageInputPanel.
  const handleImageInputConfirm = useCallback((src: string, description?: string) => {
    pendingImageDataRef.current = { src, description };
    setShowImagePanel(false);
    // Keep toolboxMode = 'image' so the next canvas click places the image.
  }, []);

  // G9: Cancelled from ImageInputPanel.
  const handleImageInputCancel = useCallback(() => {
    setShowImagePanel(false);
    pendingImageDataRef.current = null;
    setToolboxMode(null);
  }, []);

  // Place an element when clicking on empty canvas area while a tool is selected.
  const handlePaneClick = useCallback(
    (event: React.MouseEvent) => {
      if (!toolboxMode || toolboxMode === 'hand') return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      switch (toolboxMode) {
        case 'node':
          graph.onAddNodeAt(position.x, position.y);
          break;
        case 'note':
          // G3: Use the color selected in NoteColorPicker.
          graph.onAddNoteAt(position.x, position.y, pendingNoteColor);
          break;
        case 'text':
          graph.onAddTextAt(position.x, position.y);
          break;
        case 'image': {
          const imgData = pendingImageDataRef.current;
          if (imgData) {
            graph.onAddImageAt(position.x, position.y, imgData.src, imgData.description);
          }
          break;
        }
        case 'group':
          graph.onAddGroup();
          break;
      }
      setToolboxMode(null);
      pendingImageDataRef.current = null;
    },
    [toolboxMode, screenToFlowPosition, graph, pendingNoteColor],
  );

  // G7: Double-click empty canvas → add text element immediately in edit mode.
  const handlePaneDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      // Only trigger clicks directly on the ReactFlow pane (not on nodes/edges).
      const target = event.target as HTMLElement;
      if (!target.classList.contains('react-flow__pane')) return;
      // Only trigger when no placement tool is active.
      if (toolboxMode && toolboxMode !== 'hand') return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      graph.onAddTextAt(position.x, position.y);
    },
    [toolboxMode, screenToFlowPosition, graph],
  );

  // G5: Right-click on node → context menu.
  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: RFNode) => {
      event.preventDefault();
      setContextMenu(null); // Close any existing menu.

      const isGroupNode = node.type === 'diagramGroup';

      const items: ContextMenuItem[] = [
        {
          label: 'Edit label',
          icon: '✏️',
          action: () => {
            // Trigger label edit — fire double-click-equivalent via node toolbar.
            // PostMessage is needed; use the label change with current label as prompt.
            const current = isGroupNode
              ? graph.groups.find((g) => g.id === node.id)?.label ?? 'Group'
              : (node.data.label as string) ?? '';
            const next = window.prompt('Edit label:', current);
            if (next !== null && next.trim() !== current) {
              if (isGroupNode) {
                graph.onUpdateGroupProps(node.id, { label: next.trim() });
              } else {
                graph.onNodeLabelChange(node.id, next.trim());
              }
            }
          },
        },
        {
          label: 'Duplicate',
          icon: '📄',
          action: () => {
            graph.onDuplicateNodeAt(
              node.id,
              Math.round(node.position.x + 40),
              Math.round(node.position.y + 40),
              Math.round(node.position.x),
              Math.round(node.position.y),
            );
          },
        },
        { label: '', separator: true, action: () => {} },
        {
          label: 'Delete',
          icon: '🗑️',
          danger: true,
          action: () => {
            graph.onNodesDelete([node]);
          },
        },
      ];

      if (!isGroupNode && node.parentId) {
        items.splice(items.length - 1, 0, {
          label: 'Remove from group',
          icon: '⬡',
          action: () => graph.onRemoveFromGroup(node.id),
        });
      }

      setContextMenu({ x: event.clientX, y: event.clientY, items });
    },
    [graph],
  );

  // G6: Right-click on edge → context menu.
  const handleEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: RFEdge) => {
      event.preventDefault();
      setContextMenu(null);

      const currentStyle = (edge.data as { style?: string } | undefined)?.style ?? 'solid';
      const nextStyle = currentStyle === 'solid' ? 'dashed' : currentStyle === 'dashed' ? 'dotted' : 'solid';

      const items: ContextMenuItem[] = [
        {
          label: 'Edit label',
          icon: '✏️',
          action: () => {
            const currentLabel = typeof edge.label === 'string' ? edge.label : '';
            const next = window.prompt('Edge label:', currentLabel);
            if (next !== null) {
              graph.onUpdateEdgeProps(edge.id, { label: next.trim() });
            }
          },
        },
        {
          label: `Style: → ${nextStyle}`,
          icon: '〰️',
          action: () => {
            graph.onUpdateEdgeProps(edge.id, { style: nextStyle as 'solid' | 'dashed' | 'dotted' });
          },
        },
        { label: '', separator: true, action: () => {} },
        {
          label: 'Delete',
          icon: '🗑️',
          danger: true,
          action: () => {
            graph.onEdgesDelete([edge]);
          },
        },
      ];

      setContextMenu({ x: event.clientX, y: event.clientY, items });
    },
    [graph],
  );

  // G4: Alt+drag to duplicate. Track original position at drag start.
  const handleNodeDragStart = useCallback(
    (_event: React.MouseEvent, node: RFNode) => {
      if (_event.altKey && node.type === 'diagramNode') {
        altDragOriginalPosRef.current = { id: node.id, x: node.position.x, y: node.position.y };
      } else {
        altDragOriginalPosRef.current = null;
      }
    },
    [],
  );

  // G4: On drag stop, if Alt was held: duplicate node at drop position, restore original.
  const handleNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: RFNode, nodes: RFNode[]) => {
      const origData = altDragOriginalPosRef.current;
      if (origData && origData.id === node.id && node.type === 'diagramNode') {
        altDragOriginalPosRef.current = null;
        graph.onDuplicateNodeAt(
          node.id,
          Math.round(node.position.x),
          Math.round(node.position.y),
          Math.round(origData.x),
          Math.round(origData.y),
        );
        return; // Extension host restores the original position for us.
      }
      graph.onNodeDragStop(_event, node, nodes);
    },
    [graph],
  );
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: RFNode) => {
      // Close context menu on any click.
      setContextMenu(null);

      if (!toolboxMode || toolboxMode === 'hand') return;
      if (node.type === 'diagramGroup') {
        const position = screenToFlowPosition({ x: _event.clientX, y: _event.clientY });
        switch (toolboxMode) {
          case 'node':
            graph.onAddNodeAt(position.x, position.y, node.id);
            break;
          case 'note':
            // G3: Use selected note color.
            graph.onAddNoteAt(position.x, position.y, pendingNoteColor);
            break;
          case 'text':
            graph.onAddTextAt(position.x, position.y);
            break;
          case 'image': {
            const imgData = pendingImageDataRef.current;
            if (imgData) {
              graph.onAddImageAt(position.x, position.y, imgData.src, imgData.description);
            }
            break;
          }
          default:
            break;
        }
        setToolboxMode(null);
        pendingImageDataRef.current = null;
      } else {
        // Clicked on non-group element — cancel tool and let default selection happen.
        setToolboxMode(null);
        pendingImageDataRef.current = null;
      }
    },
    [toolboxMode, screenToFlowPosition, graph, pendingNoteColor],
  );

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
        handleSetToolboxMode(toolboxMode === 'node' ? null : 'node');
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
        if (toolboxMode) {
          setToolboxMode(null);
          pendingImageDataRef.current = null;
        } else {
          setShowSearch(false);
          setShowShortcuts(false);
        }
      }
    },
    [graph, fitView, toolboxMode, handleSetToolboxMode],
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
        if (node.type === 'textElementNode') {
          return {
            ...node,
            data: {
              ...node.data,
              onContentChange: graph.onTextContentChange,
            },
          };
        }
        if (node.type === 'imageElementNode') {
          return { ...node };
        }
        const highlighted =
          highlightedNodeIds !== null && !highlightedNodeIds.has(node.id);
        return {
          ...node,
          data: {
            ...node.data,
            onLabelChange: graph.onNodeLabelChange,
            onUnpin: graph.onUnpinNode,
            onRemoveFromGroup: node.parentId ? graph.onRemoveFromGroup : undefined,
          },
          style: {
            ...node.style,
            opacity: highlighted ? 0.25 : 1,
          },
        };
      }),
    [graph.allNodes, graph.onNodeLabelChange, graph.onUnpinNode, graph.onRemoveFromGroup, graph.onToggleGroupCollapse, graph.onTextContentChange, highlightedNodeIds],
  );

  // G2: Inject onLabelChange into every edge so DiagramEdge can dispatch label edits.
  const edgesWithCallbacks = useMemo(
    () =>
      graph.edges.map((edge) => ({
        ...edge,
        data: { ...edge.data, onLabelChange: graph.onEdgeLabelChange },
      } as RFEdge<DiagramEdgeData>)),
    [graph.edges, graph.onEdgeLabelChange],
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
    if (graph.selectedTextElementId) {
      const textNode = graph.allNodes.find((n) => n.id === `text-${graph.selectedTextElementId}`);
      if (textNode) {
        return {
          kind: 'textElement' as const,
          element: textNode.data as Record<string, unknown>,
          id: graph.selectedTextElementId,
          onUpdateTextElement: graph.onUpdateTextElementProps,
        };
      }
    }
    if (graph.selectedImageElementId) {
      const imageNode = graph.allNodes.find((n) => n.id === `image-${graph.selectedImageElementId}`);
      if (imageNode) {
        return {
          kind: 'imageElement' as const,
          element: imageNode.data as Record<string, unknown>,
          id: graph.selectedImageElementId,
          onUpdateImageElement: graph.onUpdateImageElementProps,
        };
      }
    }
    return { kind: 'none' as const };
  }, [
    graph.selectedGroupId,
    graph.selectedNodeId,
    graph.selectedEdgeId,
    graph.selectedTextElementId,
    graph.selectedImageElementId,
    graph.groups,
    graph.nodes,
    graph.edges,
    graph.allNodes,
    graph.onUpdateNodeProps,
    graph.onUpdateEdgeProps,
    graph.onUpdateGroupProps,
    graph.onUpdateTextElementProps,
    graph.onUpdateImageElementProps,
  ]);

  const toolbarProps = {
    toolboxMode,
    onSetToolboxMode: handleSetToolboxMode,
    onAddGroup: graph.onAddGroup,
    onSortNodes: graph.onSortNodes,
    onUndo: graph.onUndo,
    onRedo: graph.onRedo,
    onToggleSearch: () => setShowSearch((v) => !v),
    onToggleShortcuts: () => setShowShortcuts((v) => !v),
    onViewMetadata: graph.onViewMetadata,
    layoutDirection: graph.layoutDirection,
    onSetLayoutDirection: graph.onSetLayoutDirection,
    selectedGroupId: graph.selectedGroupId,
  };

  const isPlacingMode = toolboxMode && toolboxMode !== 'hand';

  return (
    <div className={`canvas-container${isPlacingMode ? ' canvas-container--placing' : ''}`} data-testid="canvas-container">
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

      <div className="canvas-main" data-testid="canvas-main" onDoubleClick={handlePaneDoubleClick}>
        <ReactFlow
          nodes={nodesWithCallbacks}
          edges={edgesWithCallbacks}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={graph.onNodesChange}
          onEdgesChange={graph.onEdgesChange}
          onConnect={graph.onConnect}
          onReconnect={graph.onReconnect}
          onNodeDragStart={handleNodeDragStart}
          onNodeDragStop={handleNodeDragStop}
          onNodesDelete={graph.onNodesDelete}
          onEdgesDelete={graph.onEdgesDelete}
          onSelectionChange={graph.onSelectionChange}
          onPaneClick={handlePaneClick}
          onNodeClick={handleNodeClick}
          onNodeContextMenu={handleNodeContextMenu}
          onEdgeContextMenu={handleEdgeContextMenu}
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
          {/* G3: Color picker shown when note tool is active. */}
          {toolboxMode === 'note' && (
            <NoteColorPicker selectedColor={pendingNoteColor} onSelect={setPendingNoteColor} />
          )}
          {/* G9: Image URL input panel. */}
          {showImagePanel && (
            <ImageInputPanel onConfirm={handleImageInputConfirm} onCancel={handleImageInputCancel} />
          )}
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
              {/* Reverse arrowhead for bidirectional edges — rendered at the source end. */}
              <marker
                id="diagramflow-arrow-start"
                markerWidth="10"
                markerHeight="7"
                refX="1"
                refY="3.5"
                orient="auto-start-reverse"
              >
                <polygon points="0 0, 10 3.5, 0 7" fill="var(--rf-edge, #888)" />
              </marker>
            </defs>
          </svg>
        </ReactFlow>

        <PropertiesPanel {...propertiesPanelInput} />
        {/* G5/G6: Right-click context menu for nodes and edges. */}
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={contextMenu.items}
            onClose={() => setContextMenu(null)}
          />
        )}
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

