import { describe, it, expect } from 'vitest';
import { docToFlowNodes, docToFlowEdges } from './docToFlow';
import type { DiagramDocument } from '../../types/DiagramDocument';

function makeDoc(
  overrides: Partial<DiagramDocument> = {},
): DiagramDocument {
  return {
    meta: {
      title: 'Test',
      created: '2025-01-01T00:00:00Z',
      modified: '2025-01-01T00:00:00Z',
    },
    nodes: [],
    edges: [],
    ...overrides,
  };
}

describe('docToFlowNodes', () => {
  it('returns empty array for empty document', () => {
    const doc = makeDoc();
    expect(docToFlowNodes(doc)).toEqual([]);
  });

  it('maps a single node to React Flow format', () => {
    const doc = makeDoc({
      nodes: [
        {
          id: 'n1',
          label: 'Start',
          x: 100,
          y: 200,
          width: 160,
          height: 48,
          shape: 'rectangle',
          color: 'blue',
          pinned: true,
        },
      ],
    });

    const result = docToFlowNodes(doc);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'n1',
      type: 'diagramNode',
      position: { x: 100, y: 200 },
      width: 160,
      height: 48,
      draggable: true,
      selectable: true,
      data: {
        label: 'Start',
        shape: 'rectangle',
        color: 'blue',
        pinned: true,
        width: 160,
        height: 48,
      },
    });
  });

  it('maps multiple nodes preserving all shapes', () => {
    const shapes = ['rectangle', 'rounded', 'diamond', 'cylinder'] as const;
    const doc = makeDoc({
      nodes: shapes.map((shape, i) => ({
        id: `n${i}`,
        label: `Node ${i}`,
        x: i * 100,
        y: 0,
        width: 160,
        height: 48,
        shape,
        color: 'default' as const,
        pinned: false,
      })),
    });

    const result = docToFlowNodes(doc);
    expect(result).toHaveLength(4);
    result.forEach((node, i) => {
      expect(node.data.shape).toBe(shapes[i]);
    });
  });

  it('maps node with optional notes', () => {
    const doc = makeDoc({
      nodes: [
        {
          id: 'n1',
          label: 'DB',
          x: 0,
          y: 0,
          width: 160,
          height: 48,
          shape: 'cylinder',
          color: 'green',
          pinned: false,
          notes: 'PostgreSQL instance',
        },
      ],
    });

    const result = docToFlowNodes(doc);
    expect(result[0].data.notes).toBe('PostgreSQL instance');
  });

  it('maps all 7 colors', () => {
    const colors = [
      'default', 'blue', 'green', 'red', 'yellow', 'purple', 'gray',
    ] as const;
    const doc = makeDoc({
      nodes: colors.map((color, i) => ({
        id: `n${i}`,
        label: color,
        x: 0,
        y: i * 60,
        width: 160,
        height: 48,
        shape: 'rectangle' as const,
        color,
        pinned: false,
      })),
    });

    const result = docToFlowNodes(doc);
    expect(result).toHaveLength(7);
    result.forEach((node, i) => {
      expect(node.data.color).toBe(colors[i]);
    });
  });

  it('preserves node dimensions in both data and node-level', () => {
    const doc = makeDoc({
      nodes: [
        {
          id: 'n1',
          label: 'Wide',
          x: 10,
          y: 20,
          width: 300,
          height: 100,
          shape: 'rectangle',
          color: 'default',
          pinned: false,
        },
      ],
    });

    const result = docToFlowNodes(doc);
    expect(result[0].width).toBe(300);
    expect(result[0].height).toBe(100);
    expect(result[0].data.width).toBe(300);
    expect(result[0].data.height).toBe(100);
  });
});

describe('docToFlowEdges', () => {
  it('returns empty array for empty document', () => {
    const doc = makeDoc();
    expect(docToFlowEdges(doc)).toEqual([]);
  });

  it('maps a single edge to React Flow format', () => {
    const doc = makeDoc({
      edges: [
        {
          id: 'e1',
          source: 'n1',
          target: 'n2',
          label: 'next',
          style: 'solid',
          arrow: 'normal',
        },
      ],
    });

    const result = docToFlowEdges(doc);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'e1',
      source: 'n1',
      target: 'n2',
      type: 'diagramEdge',
      label: 'next',
      animated: false,
      data: { style: 'solid', arrow: 'normal' },
    });
  });

  it('maps edge without label as empty string', () => {
    const doc = makeDoc({
      edges: [
        {
          id: 'e1',
          source: 'n1',
          target: 'n2',
          style: 'dashed',
          arrow: 'open',
        },
      ],
    });

    const result = docToFlowEdges(doc);
    expect(result[0].label).toBe('');
  });

  it('maps animated edge', () => {
    const doc = makeDoc({
      edges: [
        {
          id: 'e1',
          source: 'n1',
          target: 'n2',
          style: 'solid',
          arrow: 'arrow',
          animated: true,
        },
      ],
    });

    const result = docToFlowEdges(doc);
    expect(result[0].animated).toBe(true);
  });

  it('maps all 3 edge styles', () => {
    const styles = ['solid', 'dashed', 'dotted'] as const;
    const doc = makeDoc({
      edges: styles.map((style, i) => ({
        id: `e${i}`,
        source: 'n1',
        target: 'n2',
        style,
        arrow: 'normal' as const,
      })),
    });

    const result = docToFlowEdges(doc);
    expect(result).toHaveLength(3);
    result.forEach((edge, i) => {
      expect(edge.data?.style).toBe(styles[i]);
    });
  });

  it('maps all 4 arrow types', () => {
    const arrows = ['normal', 'arrow', 'open', 'none'] as const;
    const doc = makeDoc({
      edges: arrows.map((arrow, i) => ({
        id: `e${i}`,
        source: 'n1',
        target: 'n2',
        style: 'solid' as const,
        arrow,
      })),
    });

    const result = docToFlowEdges(doc);
    expect(result).toHaveLength(4);
    result.forEach((edge, i) => {
      expect(edge.data?.arrow).toBe(arrows[i]);
    });
  });

  it('maps multiple edges with mixed properties', () => {
    const doc = makeDoc({
      edges: [
        {
          id: 'e1',
          source: 'n1',
          target: 'n2',
          label: 'req',
          style: 'solid',
          arrow: 'arrow',
          animated: false,
        },
        {
          id: 'e2',
          source: 'n2',
          target: 'n3',
          style: 'dashed',
          arrow: 'none',
          animated: true,
        },
      ],
    });

    const result = docToFlowEdges(doc);
    expect(result).toHaveLength(2);
    expect(result[0].data?.style).toBe('solid');
    expect(result[0].label).toBe('req');
    expect(result[1].data?.style).toBe('dashed');
    expect(result[1].animated).toBe(true);
  });
});

describe('docToFlowNodes – NaN protection', () => {
  it('uses DEFAULT_NODE_WIDTH / DEFAULT_NODE_HEIGHT when width or height is 0', () => {
    const doc = makeDoc({
      nodes: [
        {
          id: 'n1',
          label: 'Bad',
          x: 10,
          y: 20,
          width: 0,
          height: 0,
          shape: 'rectangle',
          color: 'default',
          pinned: false,
        },
      ],
    });

    const [node] = docToFlowNodes(doc);
    expect(node.width).toBeGreaterThan(0);
    expect(node.height).toBeGreaterThan(0);
    expect(node.data.width).toBeGreaterThan(0);
    expect(node.data.height).toBeGreaterThan(0);
  });

  it('uses 0 as default for undefined x / y to avoid NaN positions', () => {
    const doc = makeDoc({
      nodes: [
        {
          id: 'n1',
          label: 'Missing coords',
          // x and y intentionally omitted (simulates old file format)
          x: undefined as unknown as number,
          y: undefined as unknown as number,
          width: 160,
          height: 48,
          shape: 'rectangle',
          color: 'default',
          pinned: false,
        },
      ],
    });

    const [node] = docToFlowNodes(doc);
    expect(node.position.x).toBe(0);
    expect(node.position.y).toBe(0);
    expect(Number.isNaN(node.position.x)).toBe(false);
    expect(Number.isNaN(node.position.y)).toBe(false);
  });

  it('node width and height in data are always positive numbers (never NaN)', () => {
    const doc = makeDoc({
      nodes: [
        {
          id: 'n1',
          label: 'NaN dims',
          x: 0,
          y: 0,
          width: NaN,
          height: NaN,
          shape: 'rounded',
          color: 'blue',
          pinned: false,
        },
      ],
    });

    const [node] = docToFlowNodes(doc);
    expect(Number.isNaN(node.width)).toBe(false);
    expect(Number.isNaN(node.height)).toBe(false);
    expect(Number.isNaN(node.data.width)).toBe(false);
    expect(Number.isNaN(node.data.height)).toBe(false);
  });
});
