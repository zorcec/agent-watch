import { describe, it, expect, beforeEach } from 'vitest';
import { applyOps, applyGridLayout, createEmptyDocument, sortNodesByPosition, sortGroupsByPosition } from './operations';
import type { DiagramDocument } from '../types/DiagramDocument';
import { DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT } from '../types/DiagramDocument';
import type { SemanticOp } from '../types/operations';

let idCounter = 0;
const mockId = () => `gen_${++idCounter}`;

function makeBaseDoc(): DiagramDocument {
  return {
    meta: {
      title: 'Test',
      created: '2025-01-01T00:00:00Z',
      modified: '2025-01-01T00:00:00Z',
    },
    nodes: [
      {
        id: 'n1',
        label: 'A',
        x: 100,
        y: 100,
        width: 160,
        height: 48,
        shape: 'rectangle',
        color: 'default',
        pinned: false,
      },
      {
        id: 'n2',
        label: 'B',
        x: 300,
        y: 100,
        width: 160,
        height: 48,
        shape: 'rectangle',
        color: 'blue',
        pinned: true,
      },
    ],
    edges: [
      {
        id: 'e1',
        source: 'n1',
        target: 'n2',
        style: 'solid',
        arrow: 'arrow',
      },
    ],
  };
}

describe('createEmptyDocument', () => {
  it('should create a document with default title', () => {
    const doc = createEmptyDocument();
    expect(doc.meta.title).toBe('Untitled Diagram');
    expect(doc.nodes).toHaveLength(0);
    expect(doc.edges).toHaveLength(0);
    expect(doc.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it('should create a document with custom title', () => {
    const doc = createEmptyDocument('My Diagram');
    expect(doc.meta.title).toBe('My Diagram');
  });

  it('should set ISO8601 timestamps', () => {
    const before = new Date().toISOString();
    const doc = createEmptyDocument();
    const after = new Date().toISOString();
    expect(doc.meta.created >= before).toBe(true);
    expect(doc.meta.created <= after).toBe(true);
  });
});

describe('applyOps - add_node', () => {
  beforeEach(() => {
    idCounter = 0;
  });

  it('should add a node with defaults', () => {
    const doc = makeBaseDoc();
    const result = applyOps(
      doc,
      [{ op: 'add_node', node: { label: 'New' } }],
      mockId,
    );
    expect(result.success).toBe(true);
    expect(result.document!.nodes).toHaveLength(3);
    const newNode = result.document!.nodes[2];
    expect(newNode.label).toBe('New');
    expect(newNode.id).toBe('gen_1');
    expect(newNode.x).toBe(0);
    expect(newNode.y).toBe(0);
    expect(newNode.width).toBe(160);
    expect(newNode.height).toBe(48);
    expect(newNode.shape).toBe('rectangle');
    expect(newNode.color).toBe('default');
    expect(newNode.pinned).toBe(false);
  });

  it('should add a node with custom properties', () => {
    const doc = makeBaseDoc();
    const result = applyOps(
      doc,
      [
        {
          op: 'add_node',
          node: {
            label: 'Custom',
            shape: 'diamond',
            color: 'red',
            notes: 'Decision node',
          },
        },
      ],
      mockId,
    );
    expect(result.success).toBe(true);
    const newNode = result.document!.nodes[2];
    expect(newNode.shape).toBe('diamond');
    expect(newNode.color).toBe('red');
    expect(newNode.notes).toBe('Decision node');
  });

  it('should add multiple nodes', () => {
    const doc = makeBaseDoc();
    const ops: SemanticOp[] = [
      { op: 'add_node', node: { label: 'X' } },
      { op: 'add_node', node: { label: 'Y' } },
    ];
    const result = applyOps(doc, ops, mockId);
    expect(result.success).toBe(true);
    expect(result.document!.nodes).toHaveLength(4);
  });

  it('should not mutate the original document', () => {
    const doc = makeBaseDoc();
    const originalLength = doc.nodes.length;
    applyOps(doc, [{ op: 'add_node', node: { label: 'New' } }], mockId);
    expect(doc.nodes).toHaveLength(originalLength);
  });
});

describe('applyOps - remove_node', () => {
  it('should remove a node', () => {
    const doc = makeBaseDoc();
    const result = applyOps(doc, [{ op: 'remove_node', id: 'n1' }], mockId);
    expect(result.success).toBe(true);
    expect(result.document!.nodes).toHaveLength(1);
    expect(result.document!.nodes[0].id).toBe('n2');
  });

  it('should remove connected edges when removing a node', () => {
    const doc = makeBaseDoc();
    const result = applyOps(doc, [{ op: 'remove_node', id: 'n1' }], mockId);
    expect(result.success).toBe(true);
    expect(result.document!.edges).toHaveLength(0);
  });

  it('should fail when removing non-existent node', () => {
    const doc = makeBaseDoc();
    const result = applyOps(
      doc,
      [{ op: 'remove_node', id: 'nonexistent' }],
      mockId,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should not mutate the original document', () => {
    const doc = makeBaseDoc();
    applyOps(doc, [{ op: 'remove_node', id: 'n1' }], mockId);
    expect(doc.nodes).toHaveLength(2);
    expect(doc.edges).toHaveLength(1);
  });
});

describe('applyOps - update_node', () => {
  it('should update node label', () => {
    const doc = makeBaseDoc();
    const result = applyOps(
      doc,
      [{ op: 'update_node', id: 'n1', changes: { label: 'Updated' } }],
      mockId,
    );
    expect(result.success).toBe(true);
    expect(result.document!.nodes[0].label).toBe('Updated');
  });

  it('should update node shape and color', () => {
    const doc = makeBaseDoc();
    const result = applyOps(
      doc,
      [
        {
          op: 'update_node',
          id: 'n1',
          changes: { shape: 'diamond', color: 'green' },
        },
      ],
      mockId,
    );
    expect(result.success).toBe(true);
    expect(result.document!.nodes[0].shape).toBe('diamond');
    expect(result.document!.nodes[0].color).toBe('green');
  });

  it('should update position of unpinned node', () => {
    const doc = makeBaseDoc();
    const result = applyOps(
      doc,
      [{ op: 'update_node', id: 'n1', changes: { x: 500, y: 500 } }],
      mockId,
    );
    expect(result.success).toBe(true);
    expect(result.document!.nodes[0].x).toBe(500);
    expect(result.document!.nodes[0].y).toBe(500);
  });

  it('should NOT update position of pinned node', () => {
    const doc = makeBaseDoc();
    const result = applyOps(
      doc,
      [{ op: 'update_node', id: 'n2', changes: { x: 999, y: 999 } }],
      mockId,
    );
    expect(result.success).toBe(true);
    expect(result.document!.nodes[1].x).toBe(300);
    expect(result.document!.nodes[1].y).toBe(100);
  });

  it('should allow updating label of pinned node', () => {
    const doc = makeBaseDoc();
    const result = applyOps(
      doc,
      [{ op: 'update_node', id: 'n2', changes: { label: 'New Label' } }],
      mockId,
    );
    expect(result.success).toBe(true);
    expect(result.document!.nodes[1].label).toBe('New Label');
  });

  it('should fail when updating non-existent node', () => {
    const doc = makeBaseDoc();
    const result = applyOps(
      doc,
      [
        {
          op: 'update_node',
          id: 'nonexistent',
          changes: { label: 'X' },
        },
      ],
      mockId,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should set pinned via update_node', () => {
    const doc = makeBaseDoc();
    const result = applyOps(
      doc,
      [
        {
          op: 'update_node',
          id: 'n1',
          changes: { pinned: true, x: 200, y: 200 },
        },
      ],
      mockId,
    );
    expect(result.success).toBe(true);
    const node = result.document!.nodes[0];
    expect(node.pinned).toBe(true);
    expect(node.x).toBe(200);
    expect(node.y).toBe(200);
  });
});

describe('applyOps - add_edge', () => {
  beforeEach(() => {
    idCounter = 0;
  });

  it('should add an edge between existing nodes', () => {
    const doc = makeBaseDoc();
    const result = applyOps(
      doc,
      [{ op: 'add_edge', edge: { source: 'n2', target: 'n1' } }],
      mockId,
    );
    expect(result.success).toBe(true);
    expect(result.document!.edges).toHaveLength(2);
    const newEdge = result.document!.edges[1];
    expect(newEdge.source).toBe('n2');
    expect(newEdge.target).toBe('n1');
    expect(newEdge.style).toBe('solid');
    expect(newEdge.arrow).toBe('arrow');
  });

  it('should add an edge with label and style', () => {
    const doc = makeBaseDoc();
    const result = applyOps(
      doc,
      [
        {
          op: 'add_edge',
          edge: {
            source: 'n2',
            target: 'n1',
            label: 'returns',
            style: 'dashed',
            arrow: 'open',
          },
        },
      ],
      mockId,
    );
    expect(result.success).toBe(true);
    const newEdge = result.document!.edges[1];
    expect(newEdge.label).toBe('returns');
    expect(newEdge.style).toBe('dashed');
    expect(newEdge.arrow).toBe('open');
  });

  it('should fail when source node does not exist', () => {
    const doc = makeBaseDoc();
    const result = applyOps(
      doc,
      [{ op: 'add_edge', edge: { source: 'bad', target: 'n1' } }],
      mockId,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Source node');
  });

  it('should fail when target node does not exist', () => {
    const doc = makeBaseDoc();
    const result = applyOps(
      doc,
      [{ op: 'add_edge', edge: { source: 'n1', target: 'bad' } }],
      mockId,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Target node');
  });
});

describe('applyOps - remove_edge', () => {
  it('should remove an edge', () => {
    const doc = makeBaseDoc();
    const result = applyOps(doc, [{ op: 'remove_edge', id: 'e1' }], mockId);
    expect(result.success).toBe(true);
    expect(result.document!.edges).toHaveLength(0);
  });

  it('should fail when removing non-existent edge', () => {
    const doc = makeBaseDoc();
    const result = applyOps(
      doc,
      [{ op: 'remove_edge', id: 'nonexistent' }],
      mockId,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should not affect nodes when removing an edge', () => {
    const doc = makeBaseDoc();
    const result = applyOps(doc, [{ op: 'remove_edge', id: 'e1' }], mockId);
    expect(result.success).toBe(true);
    expect(result.document!.nodes).toHaveLength(2);
  });
});

describe('applyOps - update_edge', () => {
  it('should update edge label', () => {
    const doc = makeBaseDoc();
    const result = applyOps(
      doc,
      [{ op: 'update_edge', id: 'e1', changes: { label: 'connects' } }],
      mockId,
    );
    expect(result.success).toBe(true);
    expect(result.document!.edges[0].label).toBe('connects');
  });

  it('should update edge style and arrow', () => {
    const doc = makeBaseDoc();
    const result = applyOps(
      doc,
      [
        {
          op: 'update_edge',
          id: 'e1',
          changes: { style: 'dotted', arrow: 'none' },
        },
      ],
      mockId,
    );
    expect(result.success).toBe(true);
    expect(result.document!.edges[0].style).toBe('dotted');
    expect(result.document!.edges[0].arrow).toBe('none');
  });

  it('should fail when updating non-existent edge', () => {
    const doc = makeBaseDoc();
    const result = applyOps(
      doc,
      [{ op: 'update_edge', id: 'bad', changes: { label: 'X' } }],
      mockId,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should fail when changing source to non-existent node', () => {
    const doc = makeBaseDoc();
    const result = applyOps(
      doc,
      [{ op: 'update_edge', id: 'e1', changes: { source: 'bad' } }],
      mockId,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Source node');
  });

  it('should fail when changing target to non-existent node', () => {
    const doc = makeBaseDoc();
    const result = applyOps(
      doc,
      [{ op: 'update_edge', id: 'e1', changes: { target: 'bad' } }],
      mockId,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Target node');
  });

  it('should update animated property', () => {
    const doc = makeBaseDoc();
    const result = applyOps(
      doc,
      [{ op: 'update_edge', id: 'e1', changes: { animated: true } }],
      mockId,
    );
    expect(result.success).toBe(true);
    expect(result.document!.edges[0].animated).toBe(true);
  });
});

describe('applyOps - compound operations', () => {
  beforeEach(() => {
    idCounter = 0;
  });

  it('should apply multiple operations in sequence', () => {
    const doc = makeBaseDoc();
    const ops: SemanticOp[] = [
      { op: 'add_node', node: { label: 'C' } },
      { op: 'update_node', id: 'n1', changes: { label: 'Updated A' } },
    ];
    const result = applyOps(doc, ops, mockId);
    expect(result.success).toBe(true);
    expect(result.document!.nodes).toHaveLength(3);
    expect(result.document!.nodes[0].label).toBe('Updated A');
    expect(result.document!.nodes[2].label).toBe('C');
  });

  it('should add node then edge to the new node', () => {
    const doc = makeBaseDoc();
    const ops: SemanticOp[] = [
      { op: 'add_node', node: { label: 'C' } },
      { op: 'add_edge', edge: { source: 'n1', target: 'gen_1' } },
    ];
    const result = applyOps(doc, ops, mockId);
    expect(result.success).toBe(true);
    expect(result.document!.edges).toHaveLength(2);
  });

  it('should update meta.modified timestamp', () => {
    const doc = makeBaseDoc();
    const result = applyOps(
      doc,
      [{ op: 'update_node', id: 'n1', changes: { label: 'Z' } }],
      mockId,
    );
    expect(result.success).toBe(true);
    expect(result.document!.meta.modified).not.toBe(doc.meta.modified);
  });

  it('should stop on first failing operation', () => {
    const doc = makeBaseDoc();
    const ops: SemanticOp[] = [
      { op: 'update_node', id: 'nonexistent', changes: { label: 'X' } },
      { op: 'add_node', node: { label: 'C' } },
    ];
    const result = applyOps(doc, ops, mockId);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// agentContext auto-generation
// ---------------------------------------------------------------------------

describe('applyOps — agentContext auto-generation', () => {
  beforeEach(() => { idCounter = 0; });

  it('generates agentContext after a successful op', () => {
    const doc = makeBaseDoc();
    const result = applyOps(doc, [{ op: 'add_node', node: { label: 'New' } }], mockId);

    expect(result.success).toBe(true);
    expect(result.document!.agentContext).toBeDefined();
    expect(result.document!.agentContext!.format).toBe('diagramflow-v1');
  });

  it('agentContext.nodeIndex contains all node labels', () => {
    const doc = makeBaseDoc();
    const result = applyOps(doc, [{ op: 'add_node', node: { label: 'C' } }], mockId);

    const labels = result.document!.agentContext!.nodeIndex.map((n) => n.label);
    expect(labels).toContain('A');
    expect(labels).toContain('B');
    expect(labels).toContain('C');
  });

  it('agentContext.edgeIndex maps IDs to labels', () => {
    const doc = makeBaseDoc();
    // base doc has n1→n2 edge e1
    const result = applyOps(doc, [{ op: 'update_node', id: 'n1', changes: { label: 'A' } }], mockId);

    const edge = result.document!.agentContext!.edgeIndex[0];
    expect(edge.from).toBe('A');
    expect(edge.to).toBe('B');
  });

  it('does not generate agentContext on validation failure', () => {
    const doc = makeBaseDoc();
    const result = applyOps(doc, [{ op: 'remove_node', id: 'nonexistent' }], mockId);

    expect(result.success).toBe(false);
    expect(result.document).toBeUndefined();
  });

  it('agentContext.summary includes title and node count', () => {
    const doc = makeBaseDoc();
    const result = applyOps(doc, [{ op: 'update_node', id: 'n1', changes: { label: 'n1' } }], mockId);

    const summary = result.document!.agentContext!.summary;
    expect(summary).toContain('"Test"');
    expect(summary).toContain('2 nodes');
    expect(summary).toContain('1 edge');
  });
});

// ---------------------------------------------------------------------------
// sortNodesByPosition (pure function)
// ---------------------------------------------------------------------------

function makeNode(id: string, x: number, y: number) {
  return {
    id,
    label: id.toUpperCase(),
    x,
    y,
    width: 160,
    height: 48,
    shape: 'rectangle' as const,
    color: 'default' as const,
    pinned: false,
  };
}

describe('sortNodesByPosition', () => {
  it('TB: sorts by y asc, then x asc as tiebreaker', () => {
    const nodes = [makeNode('c', 100, 300), makeNode('a', 200, 100), makeNode('b', 50, 100)];
    const sorted = sortNodesByPosition(nodes, 'TB');
    expect(sorted.map((n) => n.id)).toEqual(['b', 'a', 'c']);
  });

  it('BT: sorts by y desc, then x asc as tiebreaker', () => {
    const nodes = [makeNode('c', 100, 300), makeNode('a', 200, 100), makeNode('b', 50, 100)];
    const sorted = sortNodesByPosition(nodes, 'BT');
    expect(sorted.map((n) => n.id)).toEqual(['c', 'b', 'a']);
  });

  it('LR: sorts by x asc, then y asc as tiebreaker', () => {
    const nodes = [makeNode('c', 300, 100), makeNode('a', 100, 200), makeNode('b', 100, 50)];
    const sorted = sortNodesByPosition(nodes, 'LR');
    expect(sorted.map((n) => n.id)).toEqual(['b', 'a', 'c']);
  });

  it('RL: sorts by x desc, then y asc as tiebreaker', () => {
    const nodes = [makeNode('c', 300, 100), makeNode('a', 100, 200), makeNode('b', 100, 50)];
    const sorted = sortNodesByPosition(nodes, 'RL');
    expect(sorted.map((n) => n.id)).toEqual(['c', 'b', 'a']);
  });

  it('does not mutate the input array', () => {
    const nodes = [makeNode('b', 200, 0), makeNode('a', 0, 0)];
    const original = [...nodes];
    sortNodesByPosition(nodes, 'LR');
    expect(nodes[0].id).toBe(original[0].id);
    expect(nodes[1].id).toBe(original[1].id);
  });

  it('handles empty array', () => {
    expect(sortNodesByPosition([], 'TB')).toEqual([]);
  });

  it('handles single node', () => {
    const nodes = [makeNode('a', 100, 100)];
    expect(sortNodesByPosition(nodes, 'LR')).toHaveLength(1);
  });

  it('stable-sorts nodes with identical positions', () => {
    const nodes = [makeNode('a', 0, 0), makeNode('b', 0, 0)];
    const sorted = sortNodesByPosition(nodes, 'TB');
    // Both share (0,0) — order should remain stable (JS sort is stable in V8)
    expect(sorted).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// applyOps - sort_nodes
// ---------------------------------------------------------------------------

describe('applyOps - sort_nodes', () => {
  it('sorts nodes top-to-bottom (TB)', () => {
    const doc = makeBaseDoc();
    // n2 is at y=100 (same as n1), but x=300 > n1 x=100 → n1 before n2
    const result = applyOps(doc, [{ op: 'sort_nodes', direction: 'TB' }], mockId);
    expect(result.success).toBe(true);
    expect(result.document!.nodes.map((n) => n.id)).toEqual(['n1', 'n2']);
  });

  it('sorts nodes left-to-right (LR)', () => {
    const doc = makeBaseDoc();
    const result = applyOps(doc, [{ op: 'sort_nodes', direction: 'LR' }], mockId);
    expect(result.success).toBe(true);
    // n1 x=100, n2 x=300 → n1 first
    expect(result.document!.nodes.map((n) => n.id)).toEqual(['n1', 'n2']);
  });

  it('reverses order when sorting right-to-left (RL)', () => {
    const doc = makeBaseDoc();
    const result = applyOps(doc, [{ op: 'sort_nodes', direction: 'RL' }], mockId);
    expect(result.success).toBe(true);
    // n2 x=300 > n1 x=100 → n2 first in RL
    expect(result.document!.nodes.map((n) => n.id)).toEqual(['n2', 'n1']);
  });

  it('does not mutate the original document', () => {
    const doc = makeBaseDoc();
    const originalOrder = doc.nodes.map((n) => n.id);
    applyOps(doc, [{ op: 'sort_nodes', direction: 'RL' }], mockId);
    expect(doc.nodes.map((n) => n.id)).toEqual(originalOrder);
  });
});
// ---------------------------------------------------------------------------
// sort_nodes — top-level only (keeps grouped nodes intact)
// ---------------------------------------------------------------------------

function makeDocWithGroups(): DiagramDocument {
  return {
    meta: {
      title: 'Groups Test',
      created: '2025-01-01T00:00:00Z',
      modified: '2025-01-01T00:00:00Z',
    },
    nodes: [
      // Top-level node at x=300 (rightmost)
      makeNode('top-right', 300, 50),
      // Grouped node inside g1 — should NOT be touched by top-level sort
      { ...makeNode('g1-node-b', 200, 200), group: 'g1' },
      { ...makeNode('g1-node-a', 100, 200), group: 'g1' },
      // Top-level node at x=50 (leftmost)
      makeNode('top-left', 50, 50),
    ],
    edges: [],
    groups: [
      { id: 'g1', label: 'Group One', x: 60, y: 160 },
      { id: 'g2', label: 'Group Two', x: 400, y: 160 },
    ],
  };
}

describe('applyOps - sort_nodes (top-level only, no groupId)', () => {
  it('sorts top-level nodes by position (LR) without touching grouped nodes', () => {
    const doc = makeDocWithGroups();
    const result = applyOps(doc, [{ op: 'sort_nodes', direction: 'LR' }], mockId);
    expect(result.success).toBe(true);
    const after = result.document!;

    // Top-level nodes should be ordered by x: top-left (50) before top-right (300)
    const topLevel = after.nodes.filter((n) => !n.group);
    expect(topLevel.map((n) => n.id)).toEqual(['top-left', 'top-right']);
  });

  it('grouped nodes remain in the nodes array after top-level sort', () => {
    const doc = makeDocWithGroups();
    const result = applyOps(doc, [{ op: 'sort_nodes', direction: 'LR' }], mockId);
    expect(result.success).toBe(true);
    const groupedIds = result.document!.nodes.filter((n) => n.group).map((n) => n.id);
    expect(groupedIds).toContain('g1-node-a');
    expect(groupedIds).toContain('g1-node-b');
  });

  it('also sorts the groups array by position (LR) during top-level sort', () => {
    const doc = makeDocWithGroups();
    // g1 at x=60, g2 at x=400 → LR: g1 before g2 ✓ (already sorted)
    // Swap group order to verify sort works
    doc.groups = [
      { id: 'g2', label: 'Group Two', x: 400, y: 160 },
      { id: 'g1', label: 'Group One', x: 60, y: 160 },
    ];
    const result = applyOps(doc, [{ op: 'sort_nodes', direction: 'LR' }], mockId);
    expect(result.success).toBe(true);
    // After sort, g1 (x=60) should come before g2 (x=400)
    const groupIds = result.document!.groups!.map((g) => g.id);
    expect(groupIds).toEqual(['g1', 'g2']);
  });
});

// ---------------------------------------------------------------------------
// sort_nodes — group-scoped (groupId provided)
// ---------------------------------------------------------------------------

describe('applyOps - sort_nodes (group-scoped, with groupId)', () => {
  it('sorts nodes inside the specified group without touching top-level or other groups', () => {
    const doc = makeDocWithGroups();
    // g1 nodes: g1-node-b (x=200) and g1-node-a (x=100)
    // LR sort inside g1 → g1-node-a (x=100) before g1-node-b (x=200)
    const result = applyOps(doc, [{ op: 'sort_nodes', direction: 'LR', groupId: 'g1' }], mockId);
    expect(result.success).toBe(true);
    const after = result.document!;

    const g1Nodes = after.nodes.filter((n) => n.group === 'g1').map((n) => n.id);
    expect(g1Nodes).toEqual(['g1-node-a', 'g1-node-b']);
  });

  it('top-level nodes are not affected by group-scoped sort', () => {
    const doc = makeDocWithGroups();
    const topBefore = doc.nodes.filter((n) => !n.group).map((n) => n.id);
    const result = applyOps(doc, [{ op: 'sort_nodes', direction: 'LR', groupId: 'g1' }], mockId);
    expect(result.success).toBe(true);
    const topAfter = result.document!.nodes.filter((n) => !n.group).map((n) => n.id);
    expect(topAfter).toEqual(topBefore);
  });

  it('groups array is not sorted when groupId is provided', () => {
    const doc = makeDocWithGroups();
    // Deliberately put groups out of LR order
    doc.groups = [
      { id: 'g2', label: 'Group Two', x: 400, y: 160 },
      { id: 'g1', label: 'Group One', x: 60, y: 160 },
    ];
    const result = applyOps(doc, [{ op: 'sort_nodes', direction: 'LR', groupId: 'g1' }], mockId);
    expect(result.success).toBe(true);
    // Groups should remain in original order since we only sorted inside g1
    const groupIds = result.document!.groups!.map((g) => g.id);
    expect(groupIds).toEqual(['g2', 'g1']);
  });
});

// ---------------------------------------------------------------------------
// sortGroupsByPosition (pure function)
// ---------------------------------------------------------------------------

describe('sortGroupsByPosition', () => {
  const nodes = [
    makeNode('n1', 100, 100),
    makeNode('n2', 400, 100),
  ];

  it('sorts groups by stored x/y position (LR)', () => {
    const groups = [
      { id: 'g2', label: 'B', x: 400, y: 100 },
      { id: 'g1', label: 'A', x: 50, y: 100 },
    ];
    const sorted = sortGroupsByPosition(groups, nodes, 'LR');
    expect(sorted.map((g) => g.id)).toEqual(['g1', 'g2']);
  });

  it('sorts groups by stored x/y position (RL)', () => {
    const groups = [
      { id: 'g1', label: 'A', x: 50, y: 100 },
      { id: 'g2', label: 'B', x: 400, y: 100 },
    ];
    const sorted = sortGroupsByPosition(groups, nodes, 'RL');
    expect(sorted.map((g) => g.id)).toEqual(['g2', 'g1']);
  });

  it('falls back to child bounding box when x/y not set', () => {
    // n1 is at x=100, n2 is at x=400
    // groupA contains n1 (leftmost), groupB contains n2 (rightmost)
    const groupNodes = [
      { ...makeNode('n1', 100, 100), group: 'groupA' },
      { ...makeNode('n2', 400, 100), group: 'groupB' },
    ];
    const groups = [
      { id: 'groupB', label: 'B' },
      { id: 'groupA', label: 'A' },
    ];
    const sorted = sortGroupsByPosition(groups, groupNodes, 'LR');
    expect(sorted.map((g) => g.id)).toEqual(['groupA', 'groupB']);
  });

  it('does not mutate the input array', () => {
    const groups = [
      { id: 'g2', label: 'B', x: 200, y: 0 },
      { id: 'g1', label: 'A', x: 0, y: 0 },
    ];
    const original = [...groups];
    sortGroupsByPosition(groups, nodes, 'LR');
    expect(groups[0].id).toBe(original[0].id);
  });

  it('handles empty groups array', () => {
    expect(sortGroupsByPosition([], nodes, 'TB')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// applyGridLayout (pure function)
// ---------------------------------------------------------------------------

describe('applyGridLayout', () => {
  const STEP_W = DEFAULT_NODE_WIDTH + 40; // 200
  const STEP_H = DEFAULT_NODE_HEIGHT + 40; // 88

  it('returns empty array for empty input', () => {
    expect(applyGridLayout([], 'TB', 0, 0)).toEqual([]);
  });

  it('TB: single node placed at start position', () => {
    const nodes = [makeNode('a', 0, 0)];
    const result = applyGridLayout(nodes, 'TB', 50, 100);
    expect(result[0].x).toBe(50);
    expect(result[0].y).toBe(100);
  });

  it('TB: places nodes in rows (same y for same row, different x per column)', () => {
    const nodes = [makeNode('a', 0, 0), makeNode('b', 0, 0)];
    // colCount = ceil(sqrt(2)) = 2; TB: col=i%2, row=i/2
    const result = applyGridLayout(nodes, 'TB', 0, 0);
    // i=0: col=0,row=0 → (0, 0)
    // i=1: col=1,row=0 → (STEP_W, 0)
    expect(result[0]).toMatchObject({ x: 0, y: 0 });
    expect(result[1]).toMatchObject({ x: STEP_W, y: 0 });
  });

  it('LR: places nodes in columns (same x for same col, different y per row)', () => {
    const nodes = [makeNode('a', 0, 0), makeNode('b', 0, 0)];
    // colCount=2; LR: row=i%2, col=i/2
    const result = applyGridLayout(nodes, 'LR', 0, 0);
    // i=0: col=0,row=0 → (0, 0)
    // i=1: col=0,row=1 → (0, STEP_H)
    expect(result[0]).toMatchObject({ x: 0, y: 0 });
    expect(result[1]).toMatchObject({ x: 0, y: STEP_H });
  });

  it('preserves non-position properties (label, shape, color, pinned)', () => {
    const node = { ...makeNode('a', 10, 20), pinned: true };
    const result = applyGridLayout([node], 'TB', 5, 5);
    expect(result[0].id).toBe('a');
    expect(result[0].pinned).toBe(true);
    expect(result[0].x).toBe(5);
    expect(result[0].y).toBe(5);
  });

  it('does not mutate input nodes', () => {
    const nodes = [makeNode('a', 10, 20)];
    applyGridLayout(nodes, 'TB', 0, 0);
    expect(nodes[0].x).toBe(10);
    expect(nodes[0].y).toBe(20);
  });

  it('4 nodes TB: produces 2×2 grid layout', () => {
    const nodes = [makeNode('a', 0, 0), makeNode('b', 0, 0), makeNode('c', 0, 0), makeNode('d', 0, 0)];
    // colCount = ceil(sqrt(4)) = 2
    const result = applyGridLayout(nodes, 'TB', 0, 0);
    expect(result[0]).toMatchObject({ x: 0, y: 0 });          // col 0, row 0
    expect(result[1]).toMatchObject({ x: STEP_W, y: 0 });     // col 1, row 0
    expect(result[2]).toMatchObject({ x: 0, y: STEP_H });     // col 0, row 1
    expect(result[3]).toMatchObject({ x: STEP_W, y: STEP_H }); // col 1, row 1
  });
});

// ---------------------------------------------------------------------------
// sort_nodes — nodes get repositioned in grid after sort
// ---------------------------------------------------------------------------

describe('applyOps - sort_nodes repositioning', () => {
  it('nodes receive new positions matching grid layout after TB sort', () => {
    const doc = makeBaseDoc();
    // n1 at (100,100), n2 at (300,100)
    // TB sort order: n1 (x=100) then n2 (x=300) — same y, x tiebreaker
    const STEP_W = DEFAULT_NODE_WIDTH + 40;
    const result = applyOps(doc, [{ op: 'sort_nodes', direction: 'TB' }], mockId);
    expect(result.success).toBe(true);
    const after = result.document!;
    // n1 at col=0,row=0 → (100, 100)  n2 at col=1,row=0 → (100+STEP_W, 100)
    expect(after.nodes.find((n) => n.id === 'n1')!.x).toBe(100);
    expect(after.nodes.find((n) => n.id === 'n1')!.y).toBe(100);
    expect(after.nodes.find((n) => n.id === 'n2')!.x).toBe(100 + STEP_W);
    expect(after.nodes.find((n) => n.id === 'n2')!.y).toBe(100);
  });

  it('grouped nodes keep their positions when top-level is sorted', () => {
    const doc = makeDocWithGroups();
    const g1NodesBefore = doc.nodes.filter((n) => n.group === 'g1').map((n) => ({ id: n.id, x: n.x, y: n.y }));
    const result = applyOps(doc, [{ op: 'sort_nodes', direction: 'LR' }], mockId);
    expect(result.success).toBe(true);
    for (const before of g1NodesBefore) {
      const after = result.document!.nodes.find((n) => n.id === before.id)!;
      expect(after.x).toBe(before.x);
      expect(after.y).toBe(before.y);
    }
  });

  it('group-scoped sort repositions nodes inside group to grid positions', () => {
    const doc = makeDocWithGroups();
    // g1 nodes: g1-node-b (200,200) and g1-node-a (100,200)
    // LR sort: g1-node-a (x=100) first, g1-node-b (x=200) second
    const result = applyOps(doc, [{ op: 'sort_nodes', direction: 'LR', groupId: 'g1' }], mockId);
    expect(result.success).toBe(true);
    const a = result.document!.nodes.find((n) => n.id === 'g1-node-a')!;
    const b = result.document!.nodes.find((n) => n.id === 'g1-node-b')!;
    // a should come before b (in grid position)
    // Both nodes at same y (200), so with 2 nodes and colCount=2 in LR layout:
    // a at (100, 200), b at (100, 200 + STEP_H)
    expect(a.x).toBe(100);
    expect(a.y).toBe(200);
    const STEP_H = DEFAULT_NODE_HEIGHT + 40;
    expect(b.x).toBe(100);
    expect(b.y).toBe(200 + STEP_H);
  });
});

// ---------------------------------------------------------------------------
// sort_nodes — meta.layoutDirection is persisted
// ---------------------------------------------------------------------------

describe('applyOps - sort_nodes persists meta.layoutDirection', () => {
  it('persists the sort direction to meta.layoutDirection', () => {
    const doc = makeBaseDoc();
    // meta.layoutDirection is undefined initially
    const result = applyOps(doc, [{ op: 'sort_nodes', direction: 'LR' }], mockId);
    expect(result.success).toBe(true);
    expect(result.document!.meta.layoutDirection).toBe('LR');
  });

  it('overwrites existing meta.layoutDirection on sort', () => {
    const doc = makeBaseDoc();
    doc.meta.layoutDirection = 'TB';
    const result = applyOps(doc, [{ op: 'sort_nodes', direction: 'RL' }], mockId);
    expect(result.success).toBe(true);
    expect(result.document!.meta.layoutDirection).toBe('RL');
  });

  it('group-scoped sort also persists direction to meta', () => {
    const doc = makeDocWithGroups();
    const result = applyOps(doc, [{ op: 'sort_nodes', direction: 'BT', groupId: 'g1' }], mockId);
    expect(result.success).toBe(true);
    expect(result.document!.meta.layoutDirection).toBe('BT');
  });

  it('does not mutate original document meta', () => {
    const doc = makeBaseDoc();
    applyOps(doc, [{ op: 'sort_nodes', direction: 'LR' }], mockId);
    expect(doc.meta.layoutDirection).toBeUndefined();
  });
});
