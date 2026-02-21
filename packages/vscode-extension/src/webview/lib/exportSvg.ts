import type { DiagramDocument } from '../../types/DiagramDocument';

const DIAGRAM_NS = 'https://diagramflow.vscode/schema';

const NODE_COLORS: Record<string, { fill: string; stroke: string; text: string }> = {
  default: { fill: '#2d2d2d', stroke: '#555', text: '#ccc' },
  blue: { fill: '#1e3a5f', stroke: '#4a90d9', text: '#90c4f9' },
  green: { fill: '#1a3a1a', stroke: '#4a9a4a', text: '#90d490' },
  red: { fill: '#3a1a1a', stroke: '#c84040', text: '#f09090' },
  yellow: { fill: '#3a3a1a', stroke: '#c8a840', text: '#f0d490' },
  purple: { fill: '#2a1a3a', stroke: '#8040c8', text: '#c090f0' },
  gray: { fill: '#333', stroke: '#666', text: '#aaa' },
};

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildExportSvg(doc: DiagramDocument | null): string | null {
  if (!doc) return null;

  const pad = 40;
  const { nodes, edges } = doc;

  if (nodes.length === 0) return null;

  const minX = Math.min(...nodes.map((n) => n.x)) - pad;
  const minY = Math.min(...nodes.map((n) => n.y)) - pad;
  const maxRight = Math.max(...nodes.map((n) => n.x + n.width)) + pad;
  const maxBottom = Math.max(...nodes.map((n) => n.y + n.height)) + pad;
  const vbWidth = maxRight - minX;
  const vbHeight = maxBottom - minY;

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const edgeSvg = buildEdgeSvg(edges, nodeMap);
  const nodeSvg = buildNodeSvg(nodes);
  const metadataXml = `<metadata><diagramflow:source xmlns:diagramflow="${DIAGRAM_NS}">${escapeXml(JSON.stringify(doc))}</diagramflow:source></metadata>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${vbWidth} ${vbHeight}" width="${vbWidth}" height="${vbHeight}">
${metadataXml}
<rect width="100%" height="100%" fill="#1e1e1e"/>
<defs>
  <marker id="arrow-normal" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#888"/></marker>
  <marker id="arrow-open" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polyline points="0 0, 10 3.5, 0 7" fill="none" stroke="#888" stroke-width="1.5"/></marker>
</defs>
<g id="edge-layer">${edgeSvg}</g>
<g id="node-layer">${nodeSvg}</g>
</svg>`;
}

function buildEdgeSvg(
  edges: DiagramDocument['edges'],
  nodeMap: Map<string, DiagramDocument['nodes'][number]>,
): string {
  let svg = '';
  for (const edge of edges) {
    const src = nodeMap.get(edge.source);
    const tgt = nodeMap.get(edge.target);
    if (!src || !tgt) continue;

    const x1 = src.x + src.width / 2;
    const y1 = src.y + src.height / 2;
    const x2 = tgt.x + tgt.width / 2;
    const y2 = tgt.y + tgt.height / 2;

    const dash =
      edge.style === 'dashed' ? 'stroke-dasharray="8,4"' :
        edge.style === 'dotted' ? 'stroke-dasharray="2,4"' : '';
    const marker =
      edge.arrow === 'normal' || edge.arrow === 'arrow'
        ? 'marker-end="url(#arrow-normal)"'
        : edge.arrow === 'open'
          ? 'marker-end="url(#arrow-open)"'
          : '';

    svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#888" stroke-width="2" ${dash} ${marker}/>\n`;

    if (edge.label) {
      svg += `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 6}" text-anchor="middle" fill="#aaa" font-size="11">${escapeXml(edge.label)}</text>\n`;
    }
  }
  return svg;
}

function buildNodeSvg(nodes: DiagramDocument['nodes']): string {
  let svg = '';
  for (const node of nodes) {
    const colors = NODE_COLORS[node.color] ?? NODE_COLORS.default;
    const shape = renderNodeShape(node, colors);
    const label = `<text x="${node.width / 2}" y="${node.height / 2 + 1}" text-anchor="middle" dominant-baseline="middle" fill="${colors.text}" font-size="13">${escapeXml(node.label)}</text>`;
    svg += `<g transform="translate(${node.x},${node.y})">${shape}${label}</g>\n`;
  }
  return svg;
}

function renderNodeShape(
  node: DiagramDocument['nodes'][number],
  colors: { fill: string; stroke: string },
): string {
  const { width, height } = node;

  switch (node.shape) {
    case 'diamond': {
      const cx = width / 2;
      const cy = height / 2;
      return `<polygon points="${cx},0 ${width},${cy} ${cx},${height} 0,${cy}" fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="2"/>`;
    }
    case 'rounded':
      return `<rect width="${width}" height="${height}" rx="12" ry="12" fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="2"/>`;
    case 'cylinder':
      return `<rect width="${width}" height="${height}" rx="10" ry="10" fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="2"/>`;
    default:
      return `<rect width="${width}" height="${height}" rx="4" ry="4" fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="2"/>`;
  }
}

export function rasterizeSvgToPng(
  svgData: string,
  onComplete: (base64: string) => void,
): void {
  const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = new Image();

  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(img.naturalWidth, 800);
    canvas.height = Math.max(img.naturalHeight, 600);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      URL.revokeObjectURL(url);
      return;
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    const dataUrl = canvas.toDataURL('image/png');
    const base64 = dataUrl.split(',')[1] ?? '';
    onComplete(base64);
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}
