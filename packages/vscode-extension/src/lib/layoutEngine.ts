import dagre from '@dagrejs/dagre';
import type { DiagramDocument } from '../types/DiagramDocument';
import { DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT } from '../types/DiagramDocument';

export interface LayoutResult {
  nodeId: string;
  x: number;
  y: number;
}

export interface LayoutConfig {
  rankdir: 'LR' | 'TB' | 'RL' | 'BT';
  ranksep: number;
  nodesep: number;
  marginx: number;
  marginy: number;
}

export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  rankdir: 'TB',
  ranksep: 120,
  nodesep: 80,
  marginx: 60,
  marginy: 60,
};

const GRID_SIZE = 20;

/**
 * Computes positions for unpinned nodes that sit exactly at the origin (x=0,y=0).
 * Pinned nodes and nodes with existing positions are left untouched.
 * Uses Dagre for proper graph layout with edge-crossing minimization.
 */
export function computePartialLayout(
  doc: DiagramDocument,
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG,
): LayoutResult[] {
  const unpinnedAtOrigin = doc.nodes.filter(
    (n) => !n.pinned && n.x === 0 && n.y === 0,
  );

  if (unpinnedAtOrigin.length === 0) return [];

  return computeDagreLayout(doc, unpinnedAtOrigin, config);
}

/**
 * Computes layout for all NON-PINNED nodes.
 * Pinned nodes retain their positions — only unpinned nodes are repositioned.
 * Used by the "Auto Layout All" command.
 * Dagre produces a proper hierarchical graph layout with minimized edge crossings.
 */
export function computeFullLayout(
  doc: DiagramDocument,
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG,
): LayoutResult[] {
  const unpinnedNodes = doc.nodes.filter((n) => !n.pinned);
  if (unpinnedNodes.length === 0) return [];
  return computeDagreLayout(doc, unpinnedNodes, config);
}

/**
 * Dagre-powered layout. Builds a directed graph from the diagram document,
 * runs Dagre's Sugiyama-style layout, and maps results back to diagram coordinates.
 *
 * Dagre guarantees:
 *  - Nodes are placed in ranked layers aligned with the flow direction.
 *  - Edge crossings are minimized via the barrycenter heuristic.
 *  - Nodes never overlap.
 */
function computeDagreLayout(
  doc: DiagramDocument,
  targetNodes: typeof doc.nodes,
  config: LayoutConfig,
): LayoutResult[] {
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({
    rankdir: config.rankdir,
    ranksep: config.ranksep,
    nodesep: config.nodesep,
    marginx: config.marginx,
    marginy: config.marginy,
    edgesep: 40,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const targetIds = new Set(targetNodes.map((n) => n.id));

  for (const node of targetNodes) {
    const w = node.width > 0 ? node.width : DEFAULT_NODE_WIDTH;
    const h = node.height > 0 ? node.height : DEFAULT_NODE_HEIGHT;
    g.setNode(node.id, { width: w, height: h });
  }

  for (const edge of doc.edges) {
    if (targetIds.has(edge.source) && targetIds.has(edge.target)) {
      g.setEdge(edge.source, edge.target, {}, edge.id);
    }
  }

  dagre.layout(g);

  return targetNodes.map((node) => {
    const n = g.node(node.id);
    const w = node.width > 0 ? node.width : DEFAULT_NODE_WIDTH;
    const h = node.height > 0 ? node.height : DEFAULT_NODE_HEIGHT;
    // Snap to grid so auto-layout positions align with the canvas grid.
    const rawX = n.x - w / 2;
    const rawY = n.y - h / 2;
    return {
      nodeId: node.id,
      x: Math.round(rawX / GRID_SIZE) * GRID_SIZE,
      y: Math.round(rawY / GRID_SIZE) * GRID_SIZE,
    };
  });
}
