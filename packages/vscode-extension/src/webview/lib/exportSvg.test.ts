import { describe, it, expect } from 'vitest';
import { buildExportSvg, escapeXml } from './exportSvg';
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

describe('escapeXml', () => {
  it('escapes ampersands', () => {
    expect(escapeXml('A & B')).toBe('A &amp; B');
  });

  it('escapes angle brackets and quotes', () => {
    expect(escapeXml('<div class="x">')).toBe(
      '&lt;div class=&quot;x&quot;&gt;',
    );
  });

  it('returns empty string unchanged', () => {
    expect(escapeXml('')).toBe('');
  });

  it('handles multiple special characters', () => {
    expect(escapeXml('a & b < c > d "e"')).toBe(
      'a &amp; b &lt; c &gt; d &quot;e&quot;',
    );
  });
});

describe('buildExportSvg', () => {
  it('returns null for null doc', () => {
    expect(buildExportSvg(null)).toBeNull();
  });

  it('returns null for doc with no nodes', () => {
    expect(buildExportSvg(makeDoc())).toBeNull();
  });

  it('produces valid SVG for single node', () => {
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
          pinned: false,
        },
      ],
    });

    const svg = buildExportSvg(doc);
    expect(svg).not.toBeNull();
    expect(svg).toContain('<?xml version="1.0"');
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('Start');
    expect(svg).toContain('translate(100,200)');
  });

  it('renders rectangle shape with rx=4', () => {
    const doc = makeDoc({
      nodes: [{
        id: 'n1', label: 'A', x: 0, y: 0,
        width: 160, height: 48, shape: 'rectangle',
        color: 'default', pinned: false,
      }],
    });

    const svg = buildExportSvg(doc)!;
    expect(svg).toContain('rx="4"');
  });

  it('renders rounded shape with rx=12', () => {
    const doc = makeDoc({
      nodes: [{
        id: 'n1', label: 'A', x: 0, y: 0,
        width: 160, height: 48, shape: 'rounded',
        color: 'default', pinned: false,
      }],
    });

    const svg = buildExportSvg(doc)!;
    expect(svg).toContain('rx="12"');
  });

  it('renders diamond shape as polygon', () => {
    const doc = makeDoc({
      nodes: [{
        id: 'n1', label: 'A', x: 0, y: 0,
        width: 160, height: 48, shape: 'diamond',
        color: 'default', pinned: false,
      }],
    });

    const svg = buildExportSvg(doc)!;
    expect(svg).toContain('<polygon');
    expect(svg).toContain('points="80,0 160,24 80,48 0,24"');
  });

  it('renders cylinder shape with rx=10', () => {
    const doc = makeDoc({
      nodes: [{
        id: 'n1', label: 'A', x: 0, y: 0,
        width: 160, height: 48, shape: 'cylinder',
        color: 'default', pinned: false,
      }],
    });

    const svg = buildExportSvg(doc)!;
    expect(svg).toContain('rx="10"');
  });

  it('applies correct color fills', () => {
    const doc = makeDoc({
      nodes: [{
        id: 'n1', label: 'A', x: 0, y: 0,
        width: 160, height: 48, shape: 'rectangle',
        color: 'red', pinned: false,
      }],
    });

    const svg = buildExportSvg(doc)!;
    expect(svg).toContain('fill="#3a1a1a"');
    expect(svg).toContain('stroke="#c84040"');
  });

  it('renders edges between nodes', () => {
    const doc = makeDoc({
      nodes: [
        {
          id: 'n1', label: 'A', x: 0, y: 0,
          width: 160, height: 48, shape: 'rectangle',
          color: 'default', pinned: false,
        },
        {
          id: 'n2', label: 'B', x: 300, y: 0,
          width: 160, height: 48, shape: 'rectangle',
          color: 'default', pinned: false,
        },
      ],
      edges: [{
        id: 'e1', source: 'n1', target: 'n2',
        style: 'solid', arrow: 'normal',
      }],
    });

    const svg = buildExportSvg(doc)!;
    expect(svg).toContain('<line');
    expect(svg).toContain('marker-end="url(#arrow-normal)"');
  });

  it('renders dashed edges', () => {
    const doc = makeDoc({
      nodes: [
        {
          id: 'n1', label: 'A', x: 0, y: 0,
          width: 160, height: 48, shape: 'rectangle',
          color: 'default', pinned: false,
        },
        {
          id: 'n2', label: 'B', x: 300, y: 0,
          width: 160, height: 48, shape: 'rectangle',
          color: 'default', pinned: false,
        },
      ],
      edges: [{
        id: 'e1', source: 'n1', target: 'n2',
        style: 'dashed', arrow: 'none',
      }],
    });

    const svg = buildExportSvg(doc)!;
    expect(svg).toContain('stroke-dasharray="8,4"');
  });

  it('renders edge labels', () => {
    const doc = makeDoc({
      nodes: [
        {
          id: 'n1', label: 'A', x: 0, y: 0,
          width: 160, height: 48, shape: 'rectangle',
          color: 'default', pinned: false,
        },
        {
          id: 'n2', label: 'B', x: 300, y: 0,
          width: 160, height: 48, shape: 'rectangle',
          color: 'default', pinned: false,
        },
      ],
      edges: [{
        id: 'e1', source: 'n1', target: 'n2',
        label: 'connects',
        style: 'solid', arrow: 'arrow',
      }],
    });

    const svg = buildExportSvg(doc)!;
    expect(svg).toContain('connects');
  });

  it('skips edges with missing source/target nodes', () => {
    const doc = makeDoc({
      nodes: [{
        id: 'n1', label: 'A', x: 0, y: 0,
        width: 160, height: 48, shape: 'rectangle',
        color: 'default', pinned: false,
      }],
      edges: [{
        id: 'e1', source: 'n1', target: 'missing',
        style: 'solid', arrow: 'normal',
      }],
    });

    const svg = buildExportSvg(doc)!;
    expect(svg).not.toContain('<line');
  });

  it('embeds metadata with diagram JSON', () => {
    const doc = makeDoc({
      nodes: [{
        id: 'n1', label: 'A', x: 0, y: 0,
        width: 160, height: 48, shape: 'rectangle',
        color: 'default', pinned: false,
      }],
    });

    const svg = buildExportSvg(doc)!;
    expect(svg).toContain('<metadata>');
    expect(svg).toContain('diagramflow:source');
    expect(svg).toContain('diagramflow.vscode/schema');
  });

  it('includes arrow marker definitions', () => {
    const doc = makeDoc({
      nodes: [{
        id: 'n1', label: 'A', x: 0, y: 0,
        width: 160, height: 48, shape: 'rectangle',
        color: 'default', pinned: false,
      }],
    });

    const svg = buildExportSvg(doc)!;
    expect(svg).toContain('id="arrow-normal"');
    expect(svg).toContain('id="arrow-open"');
  });

  it('calculates viewBox from node positions', () => {
    const doc = makeDoc({
      nodes: [
        {
          id: 'n1', label: 'A', x: 100, y: 50,
          width: 160, height: 48, shape: 'rectangle',
          color: 'default', pinned: false,
        },
        {
          id: 'n2', label: 'B', x: 400, y: 200,
          width: 160, height: 48, shape: 'rectangle',
          color: 'default', pinned: false,
        },
      ],
    });

    const svg = buildExportSvg(doc)!;
    // minX = 100-40=60, minY = 50-40=10
    // maxRight = 400+160+40=600, maxBottom = 200+48+40=288
    // vbWidth = 600-60=540, vbHeight = 288-10=278
    expect(svg).toContain('viewBox="60 10 540 278"');
  });

  it('escapes special characters in node labels', () => {
    const doc = makeDoc({
      nodes: [{
        id: 'n1', label: 'A & B <C>', x: 0, y: 0,
        width: 160, height: 48, shape: 'rectangle',
        color: 'default', pinned: false,
      }],
    });

    const svg = buildExportSvg(doc)!;
    expect(svg).toContain('A &amp; B &lt;C&gt;');
  });
});
