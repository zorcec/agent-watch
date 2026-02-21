 # DiagramFlow — React Flow Migration & UI/UX Overhaul

## Specification v3: Webview Rewrite + Visual E2E Testing

**Version:** 3.0.0
**Date:** 2026-02-21
**Status:** Proposal — pending implementation
**Scope:** Webview layer replacement (vanilla SVG → React Flow), UI/UX improvements, visual E2E testing strategy

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Analysis](#2-current-state-analysis)
3. [Why React Flow](#3-why-react-flow)
4. [Architecture Overview](#4-architecture-overview)
5. [Webview File Structure](#5-webview-file-structure)
6. [Build System Changes](#6-build-system-changes)
7. [React Flow Integration](#7-react-flow-integration)
8. [UI/UX Design](#8-uiux-design)
9. [Data Bridge: DiagramDocument ↔ React Flow](#9-data-bridge-diagramdocument--react-flow)
10. [Message Protocol Updates](#10-message-protocol-updates)
11. [E2E Testing Strategy](#11-e2e-testing-strategy)
12. [LLM Visual Verification Tests](#12-llm-visual-verification-tests)
13. [Migration Plan](#13-migration-plan)
14. [Dependencies](#14-dependencies)
15. [Decisions & Alternatives Considered](#15-decisions--alternatives-considered)

---

## 1. Executive Summary

### What

Replace the current 458-line vanilla TypeScript + raw SVG webview renderer with React + React Flow (`@xyflow/react` v12). Add proper canvas interaction UX (edge drawing, inline editing, context menus, minimap, zoom controls). Introduce three-tier E2E testing including LLM-based visual verification via the VS Code Skills Proxy.

### Why

The current webview renders static SVGs with basic mouse-drag. It has no zoom, no pan, no edge drawing, no inline editing, no context menus, no minimap — features that React Flow provides out-of-the-box. The existing spec v2 already specified React Flow but it was never implemented. Meanwhile, the extension host, protocol, LM tools, and services are all ready and waiting for a capable webview.

### What Stays The Same

- **Extension host**: `DiagramEditorProvider`, `DiagramService`, all 7 LM Tools — **no changes**
- **File format**: `.diagram` JSON schema — **no changes**
- **Message protocol**: Minor additions only (no breaking changes to existing messages)
- **Build tool**: esbuild — just add JSX support to the existing webview target
- **E2E infrastructure**: Same `VSCodeDesktopServer` + CDP + Playwright fixtures
- **Unit test framework**: Vitest — same patterns, more coverage

### What Changes

- **Webview source**: `src/webview/index.ts` (458 lines, vanilla) → React component tree (~600 lines across 8 files)
- **New dependencies**: `react`, `react-dom`, `@xyflow/react` (+ their types)
- **CSS**: Complete restyle using VS Code CSS variables + React Flow base styles
- **E2e tests**: Add screenshot comparison + LLM visual verification tier

---

## 2. Current State Analysis

### What Exists

| Layer | State | Lines | Gap |
|-------|-------|-------|-----|
| `src/webview/index.ts` | Vanilla TS + SVG | 458 | No zoom, pan, edge draw, inline edit, context menu, minimap |
| `src/webview/index.css` | Basic flexbox + toolbar | ~60 | No grid background, no VS Code theming |
| `src/DiagramEditorProvider.ts` | Handles all messages | 239 | Ready — already handles `ADD_NODE`, `DELETE_NODES`, `ADD_EDGE`, etc. |
| `src/messages/protocol.ts` | Full typed protocol | ~35 | Has `ADD_NODE`, `ADD_EDGE`, `DELETE_*`, `EXPORT`, `OPEN_SVG_REQUEST` |
| `src/DiagramService.ts` | Semantic ops | ~120 | Ready — `applySemanticOps`, `autoLayoutAll`, `parseDocument` |
| LM Tools (7 files) | Complete | ~400 | Fully implemented and tested |
| Unit tests | 179 passing | | Good coverage |
| E2E tests | 24 passing | | Structural only — no visual, no canvas interaction |

### Critical Gap

The protocol supports `ADD_NODE`, `DELETE_NODES`, `ADD_EDGE`, `DELETE_EDGES`, `UPDATE_NODE_LABEL`, `REQUEST_LAYOUT` — but **the webview never sends these messages**. It only sends `NODE_DRAGGED`, `EXPORT`, `OPEN_SVG_REQUEST`, and `WEBVIEW_READY`. The webview is a read-only renderer with drag and export — not an editor.

React Flow closes this gap by providing interactive canvas primitives (connect handles, inline edit, keyboard delete, add-node toolbar) that naturally map to these already-implemented protocol messages.

---

## 3. Why React Flow

### Alternatives Considered

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **Keep vanilla SVG** | Zero dependencies, small bundle | Must build zoom/pan/edge-draw/select from scratch (~2000+ lines), bugs, accessibility issues | Rejected — too much effort for too little result |
| **D3.js** | Powerful layout, data-driven | Lower-level than needed, no built-in node components, steep learning curve | Rejected — over-engineered for this use case |
| **Cytoscape.js** | Graph algorithms, layout engines | Not React-native, less customizable node rendering, dated API | Rejected — poor fit for custom node shapes |
| **Svelte Flow** | Smaller bundle, same xyflow team | Different framework, no ecosystem alignment | Rejected — unnecessary framework switch |
| **@xyflow/react v12** | Built-in pan/zoom/edge-draw/minimap/controls, custom nodes are React components, 35K+ stars, MIT, 4.4M weekly installs, actively maintained | Adds React (~180KB) + React Flow (~100KB) to bundle | **Selected** |

### What React Flow Gives Us For Free

1. **Canvas**: Pan (drag/scroll), zoom (wheel/pinch/buttons), fit-to-view
2. **Nodes**: Drag, select, multi-select (Shift+click), keyboard delete (Backspace/Delete)
3. **Edges**: Drag from handle to handle, auto-routing (bezier/step/smoothstep/straight)
4. **Plugins**: `<MiniMap />`, `<Controls />`, `<Background />`, `<NodeToolbar />`, `<NodeResizer />`
5. **State management**: `useNodesState()`, `useEdgesState()`, `addEdge()`, `applyNodeChanges()`
6. **Events**: `onNodeDragStop`, `onConnect`, `onNodesDelete`, `onEdgesDelete`, `onNodeDoubleClick`
7. **Accessibility**: ARIA labels, keyboard navigation, focus management

### Bundle Size

| Package | Gzipped Size | Note |
|---------|-------------|------|
| `react` + `react-dom` | ~44KB + ~130KB | Required by React Flow |
| `@xyflow/react` | ~90KB | Core library |
| **Total added** | **~264KB gzipped** | Loaded once, cached by VS Code webview |

The current webview bundle is 11.8KB. After migration it will be ~276KB. This is acceptable — VS Code extension webviews are loaded once per editor tab and aggressively cached. Draw.io's VS Code webview is 2.5MB+ for comparison.

---

## 4. Architecture Overview

```
┌────────────────────────────────────────────────────────────────┐
│                    Extension Host (NO CHANGES)                  │
│                                                                 │
│  DiagramEditorProvider ──► DiagramService ◄── LM Tools (7)     │
│        │                       │                                │
│        │ postMessage           │ applySemanticOps               │
│        ▼                       │ WorkspaceEdit.replace          │
│  ┌─────────────────────────────┴──────────────────────────┐    │
│  │              Webview (NEW: React + React Flow)          │    │
│  │                                                         │    │
│  │  ┌──────────────────────────────────────────────────┐  │    │
│  │  │  App.tsx                                          │  │    │
│  │  │  ├── useVSCodeBridge() — postMessage I/O         │  │    │
│  │  │  ├── useGraphState() — doc ↔ ReactFlow sync      │  │    │
│  │  │  │                                                │  │    │
│  │  │  └── CanvasPanel.tsx                              │  │    │
│  │  │      ├── <ReactFlow>                              │  │    │
│  │  │      │   ├── <DiagramNode /> (4 shapes)           │  │    │
│  │  │      │   ├── <DiagramEdge /> (3 styles)          │  │    │
│  │  │      │   ├── <Background variant="dots" />       │  │    │
│  │  │      │   ├── <MiniMap />                         │  │    │
│  │  │      │   └── <Controls />                        │  │    │
│  │  │      └── <Toolbar /> (Add, Layout, Export)       │  │    │
│  │  └──────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

### Data Flow (unchanged from spec v2)

```
User drags node → onNodeDragStop → postMessage({ type: 'NODE_DRAGGED', id, position })
  → DiagramService.applySemanticOps([{ op: 'update_node', ... pinned: true }])
  → WorkspaceEdit.replace() → file updated
  → onDidChangeTextDocument → postMessage({ type: 'DOCUMENT_UPDATED', doc })
  → useGraphState() converts doc → ReactFlow nodes/edges → re-render
```

---

## 5. Webview File Structure

```
src/webview/
├── index.tsx                  # React root mount + ReactFlowProvider
├── App.tsx                    # Main component: bridge + canvas
├── hooks/
│   ├── useVSCodeBridge.ts     # postMessage send/receive (already defined in spec v2)
│   └── useGraphState.ts       # DiagramDocument → ReactFlow state + event handlers
├── components/
│   ├── CanvasPanel.tsx        # ReactFlow wrapper + all event wiring
│   ├── DiagramNode.tsx        # Custom node: 4 shapes, handles, inline edit
│   ├── DiagramEdge.tsx        # Custom edge: 3 styles, labels, arrows
│   └── Toolbar.tsx            # Floating top bar: Add Node, Layout, Export
├── lib/
│   ├── docToFlow.ts           # DiagramDocument → { nodes: Node[], edges: Edge[] }
│   ├── docToFlow.test.ts      # Unit tests
│   ├── svgMetadata.ts         # KEEP — extractDiagramFromSvg (existing, 100% covered)
│   └── svgMetadata.test.ts    # KEEP — 12 tests (existing)
└── styles/
    └── canvas.css             # VS Code theme integration + React Flow overrides
```

**Total new files**: 9 (replacing 2 existing: `index.ts` + `index.css`)

### Files to Delete

- `src/webview/index.ts` — replaced by `index.tsx` + component tree
- `src/webview/index.css` — replaced by `styles/canvas.css`

### Files to Keep

- `src/lib/svgMetadata.ts` + `src/lib/svgMetadata.test.ts` — extracted metadata logic, reuse as-is

---

## 6. Build System Changes

### Current `esbuild.config.mjs` — Webview Target

```javascript
// CURRENT
const webviewOptions = {
  entryPoints: ['src/webview/index.ts'],
  bundle: true,
  outdir: 'dist/webview',
  format: 'iife',
  platform: 'browser',
  sourcemap: true,
  logLevel: 'info',
};
```

### New Webview Target

```javascript
// NEW
const webviewOptions = {
  entryPoints: ['src/webview/index.tsx'],          // .tsx entry
  bundle: true,
  outdir: 'dist/webview',
  format: 'iife',
  platform: 'browser',
  sourcemap: true,
  logLevel: 'info',
  jsx: 'automatic',                                 // React 17+ JSX transform
  define: { 'process.env.NODE_ENV': '"production"' }, // Required by React
  loader: { '.css': 'css' },                        // CSS bundling for React Flow styles
};
```

### Changes Summary

| Change | Why |
|--------|-----|
| Entry: `.ts` → `.tsx` | JSX syntax for React components |
| Add `jsx: 'automatic'` | Uses React 17+ JSX runtime (no manual `import React`) |
| Add `define: process.env.NODE_ENV` | React checks this for dev/prod behavior |
| Add `loader: { '.css': 'css' }` | Bundle React Flow's CSS (`@xyflow/react/dist/style.css`) |

### Extension Target — No Changes

The extension host build remains identical:

```javascript
const extensionOptions = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  sourcemap: true,
  logLevel: 'info',
};
```

### CSP Update in `getWebviewContent.ts`

```html
<!-- CURRENT -->
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none';
           style-src ${webview.cspSource} 'unsafe-inline';
           script-src 'nonce-${nonce}';
           img-src ${webview.cspSource} data:;">

<!-- NEW (add font-src for potential icon fonts, keep rest) -->
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none';
           style-src ${webview.cspSource} 'unsafe-inline';
           script-src 'nonce-${nonce}';
           img-src ${webview.cspSource} data: blob:;
           font-src ${webview.cspSource};">
```

Changes: add `blob:` to `img-src` (React Flow uses blob URLs for some SVG operations), add `font-src` (future icon font support).

---

## 7. React Flow Integration

### 7.1 Entry Point — `index.tsx`

```tsx
import { createRoot } from 'react-dom/client';
import { ReactFlowProvider } from '@xyflow/react';
import { App } from './App';
import '@xyflow/react/dist/style.css';
import './styles/canvas.css';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <ReactFlowProvider>
      <App />
    </ReactFlowProvider>
  );
}
```

Key decisions:
- `ReactFlowProvider` wraps the entire app — required for `useReactFlow()` hook access in child components
- Import React Flow's base CSS first, then our overrides
- No `StrictMode` — React Flow has known issues with double-render in strict mode

### 7.2 App Component — `App.tsx`

```tsx
import { useState } from 'react';
import { CanvasPanel } from './components/CanvasPanel';
import { useVSCodeBridge } from './hooks/useVSCodeBridge';
import { useGraphState } from './hooks/useGraphState';
import type { DiagramDocument } from '../types/DiagramDocument';

export function App() {
  const [doc, setDoc] = useState<DiagramDocument | null>(null);

  const bridge = useVSCodeBridge({ onDocumentUpdated: setDoc });
  const graph = useGraphState(doc, bridge);

  if (!doc) {
    return <div className="loading">Loading diagram...</div>;
  }

  return <CanvasPanel graph={graph} bridge={bridge} />;
}
```

### 7.3 Custom Node — `DiagramNode.tsx`

Each of the 4 shapes (`rectangle`, `rounded`, `diamond`, `cylinder`) renders as an SVG inside a React Flow node. All nodes share the same component with shape-specific SVG paths.

```tsx
import { memo, useState, useCallback } from 'react';
import { Handle, Position, NodeProps, NodeToolbar } from '@xyflow/react';

type DiagramNodeData = {
  label: string;
  shape: 'rectangle' | 'rounded' | 'diamond' | 'cylinder';
  color: string;
  pinned: boolean;
  notes?: string;
  width: number;
  height: number;
  onLabelChange?: (id: string, label: string) => void;
};

export const DiagramNode = memo(({ id, data, selected }: NodeProps<DiagramNodeData>) => {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(data.label);

  const commitEdit = useCallback(() => {
    setEditing(false);
    if (editValue.trim() !== data.label) {
      data.onLabelChange?.(id, editValue.trim());
    }
  }, [id, editValue, data]);

  return (
    <>
      {/* Handles on all 4 sides for edge connections */}
      <Handle type="target" position={Position.Top} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Bottom} />
      <Handle type="source" position={Position.Right} />

      {/* Node body — shape determined by CSS class */}
      <div
        className={`diagram-node shape-${data.shape} color-${data.color}`}
        style={{ width: data.width, height: data.height }}
        onDoubleClick={() => setEditing(true)}
        data-testid={`node-${id}`}
      >
        {data.pinned && <span className="pin-indicator">📌</span>}

        {editing ? (
          <input
            className="node-label-input"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
            autoFocus
          />
        ) : (
          <span className="node-label">{data.label}</span>
        )}
      </div>

      {/* Node toolbar — appears on hover/select */}
      <NodeToolbar isVisible={selected} position={Position.Top}>
        <div className="node-toolbar-actions">
          {/* Quick action buttons: shape, color, pin */}
        </div>
      </NodeToolbar>
    </>
  );
});
```

### 7.4 Custom Edge — `DiagramEdge.tsx`

```tsx
import { memo } from 'react';
import { BaseEdge, EdgeProps, getBezierPath, EdgeLabelRenderer } from '@xyflow/react';

type DiagramEdgeData = {
  style: 'solid' | 'dashed' | 'dotted';
  arrow: 'arrow' | 'open' | 'none';
};

export const DiagramEdge = memo(({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, data, label
}: EdgeProps<DiagramEdgeData>) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition,
  });

  const dashMap = { solid: 'none', dashed: '8 4', dotted: '2 4' };
  const markerEnd = data?.arrow === 'none' ? undefined : 'url(#arrow-marker)';

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{ strokeDasharray: dashMap[data?.style ?? 'solid'] }}
        markerEnd={markerEnd}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="edge-label"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
```

### 7.5 Toolbar — `Toolbar.tsx`

Floating toolbar at the top of the canvas. Minimal, discoverable.

```tsx
import { useReactFlow } from '@xyflow/react';

type ToolbarProps = {
  onAddNode: () => void;
  onAutoLayout: () => void;
  onExportSvg: () => void;
  onExportPng: () => void;
  onOpenSvg: () => void;
};

export function Toolbar({ onAddNode, onAutoLayout, onExportSvg, onExportPng, onOpenSvg }: ToolbarProps) {
  const { fitView, zoomIn, zoomOut } = useReactFlow();

  return (
    <div className="toolbar" data-testid="toolbar">
      <div className="toolbar-group">
        <button onClick={onAddNode} title="Add Node (N)" data-testid="btn-add-node">+ Node</button>
      </div>
      <div className="toolbar-group">
        <button onClick={onAutoLayout} title="Auto Layout (L)" data-testid="btn-layout">⬡ Layout</button>
        <button onClick={() => fitView({ padding: 0.2 })} title="Fit View (F)" data-testid="btn-fit">⊞ Fit</button>
        <button onClick={() => zoomIn()} title="Zoom In (+)">+</button>
        <button onClick={() => zoomOut()} title="Zoom Out (-)">−</button>
      </div>
      <div className="toolbar-group">
        <button onClick={onOpenSvg} title="Import SVG" data-testid="btn-open">↑ Open</button>
        <button onClick={onExportSvg} title="Save as SVG" data-testid="btn-save-svg">↓ SVG</button>
        <button onClick={onExportPng} title="Save as PNG" data-testid="btn-save-png">↓ PNG</button>
      </div>
    </div>
  );
}
```

### 7.6 Canvas Panel — `CanvasPanel.tsx`

```tsx
import { useCallback } from 'react';
import {
  ReactFlow, Background, MiniMap, Controls,
  BackgroundVariant, ConnectionMode,
} from '@xyflow/react';
import { DiagramNode } from './DiagramNode';
import { DiagramEdge } from './DiagramEdge';
import { Toolbar } from './Toolbar';
import type { GraphState } from '../hooks/useGraphState';

const nodeTypes = { diagramNode: DiagramNode };
const edgeTypes = { diagramEdge: DiagramEdge };

type CanvasPanelProps = {
  graph: GraphState;
  bridge: { postMessage: (msg: any) => void };
};

export function CanvasPanel({ graph, bridge }: CanvasPanelProps) {
  return (
    <div className="canvas-container" data-testid="canvas-container">
      <Toolbar
        onAddNode={graph.onAddNode}
        onAutoLayout={graph.onRequestLayout}
        onExportSvg={graph.onExportSvg}
        onExportPng={graph.onExportPng}
        onOpenSvg={graph.onOpenSvg}
      />
      <ReactFlow
        nodes={graph.nodes}
        edges={graph.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={graph.onNodesChange}
        onEdgesChange={graph.onEdgesChange}
        onConnect={graph.onConnect}
        onNodeDragStop={graph.onNodeDragStop}
        onNodesDelete={graph.onNodesDelete}
        onEdgesDelete={graph.onEdgesDelete}
        onNodeDoubleClick={graph.onNodeDoubleClick}
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
          nodeColor={(n) => n.data?.color ?? '#2d2d2d'}
          maskColor="rgba(0,0,0,0.5)"
          pannable
          zoomable
        />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
```

### 7.7 Keyboard Shortcuts

React Flow provides most shortcuts. We add a few custom ones:

| Shortcut | Action | Source |
|----------|--------|--------|
| Scroll/Pinch | Zoom | React Flow built-in |
| Click+drag canvas | Pan | React Flow built-in |
| Click node | Select | React Flow built-in |
| Shift+click | Multi-select | React Flow built-in |
| Backspace/Delete | Delete selected | React Flow built-in |
| Ctrl+A | Select all | React Flow built-in |
| Double-click node | Edit label | Custom (DiagramNode) |
| Drag from handle | Draw edge | React Flow built-in |
| N | Add new node | Custom |
| L | Auto layout | Custom |
| F | Fit view | Custom |
| Ctrl+Shift+S | Export SVG | Custom |

---

## 8. UI/UX Design

### 8.1 Design Principles

1. **VS Code native feel** — use `var(--vscode-*)` CSS variables for all colors
2. **Minimal chrome** — no sidebars, no tabs, no panels — just canvas + floating toolbar
3. **Progressive disclosure** — basic actions via toolbar, advanced via right-click context menu
4. **Keyboard-first** — every action has a keyboard shortcut
5. **Visual consistency** — same 7 colors, 4 shapes, 3 edge styles as the JSON schema

### 8.2 Layout

```
┌──────────────────────────────────────────────────────────┐
│  [+ Node]  [⬡ Layout] [⊞ Fit] [+ −]  │  [↑Open] [↓SVG] [↓PNG]  │  <- Toolbar (36px)
├──────────────────────────────────────────────────────────┤
│                                                          │
│     ┌──────────┐      ┌──────────────┐                   │
│     │  Client   │─────►│ Auth Service  │                  │
│     └──────────┘      └──────┬───────┘                   │
│                              │                            │
│                        ┌─────▼─────┐                     │
│                        │ Database   │                     │
│                        │ (cylinder) │                     │
│                        └───────────┘                     │
│                                                          │  <- Canvas (fills remaining)
│         [·]  [zoom controls]                             │
│         [minimap preview]                                │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 8.3 Toolbar Design

The toolbar is a single horizontal bar at the top, split into three groups:

| Group | Actions | Style |
|-------|---------|-------|
| **Create** | Add Node | Primary button |
| **Canvas** | Layout, Fit, Zoom +/- | Secondary buttons |
| **File** | Open SVG, Save SVG, Save PNG | Tertiary buttons |

Buttons are small, icon-first, with text labels. Uses VS Code button styling.

### 8.4 Node Rendering

Each node shape is rendered via CSS (not SVG inside React Flow, unlike the current vanilla approach):

- **rectangle**: `border-radius: 4px` — default box
- **rounded**: `border-radius: 16px` — rounded corners
- **diamond**: CSS `clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)` — decision node
- **cylinder**: SVG `<ellipse>` top/bottom with `<rect>` body — database

Why CSS over SVG: React Flow nodes are HTML `<div>` elements, not SVG. CSS shapes integrate better with React Flow's handle positioning, selection, and resize features. The diamond uses `clip-path` which is well-supported in Chromium (VS Code's webview engine).

### 8.5 Node Interaction

| Interaction | Action |
|-------------|--------|
| Click | Select node |
| Shift+click | Add to selection |
| Drag | Move node → sends `NODE_DRAGGED` |
| Double-click | Inline label editing |
| Right-click | Context menu: Change shape, Change color, Pin/Unpin, Add note, Delete |
| Hover | Show handles for edge connection |
| Backspace | Delete selected nodes + connected edges |

### 8.6 Edge Drawing

Users draw edges by dragging from a handle (small circle on node border) to another node's handle. React Flow provides this natively via the `onConnect` callback.

```
onConnect({ source, target }) → postMessage({ type: 'ADD_EDGE', edge: { source, target } })
```

### 8.7 Context Menu (Right-Click)

```
┌──────────────────┐
│ ✏️  Edit Label    │
│ ◇  Shape ►       │
│ 🎨 Color ►       │
│ 📌 Pin / Unpin   │
│ 📝 Add Note      │
│ ─────────────── │
│ 🗑️  Delete       │
└──────────────────┘
```

Implementation: Standard HTML `<div>` positioned at right-click coordinates, closed on blur/escape. Not a VS Code native menu (webview limitation).

### 8.8 Theme Integration

```css
/* canvas.css — VS Code theme variables */
.react-flow {
  --rf-node-bg: var(--vscode-editor-background);
  --rf-node-border: var(--vscode-panel-border);
  --rf-node-text: var(--vscode-editor-foreground);
  --rf-edge: var(--vscode-foreground);
  --rf-selection: var(--vscode-focusBorder);
  --rf-background-dots: var(--vscode-editorWidget-border);
}

/* Override React Flow's default theme */
.react-flow__node {
  background: var(--rf-node-bg);
  border: 2px solid var(--rf-node-border);
  color: var(--rf-node-text);
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
}

.react-flow__edge-path {
  stroke: var(--rf-edge);
}

.react-flow__node.selected {
  border-color: var(--rf-selection);
  box-shadow: 0 0 0 2px var(--rf-selection);
}
```

### 8.9 Node Color Palette

Same 7 colors, mapped to CSS classes:

```css
.color-default { --node-bg: var(--vscode-editor-background); --node-border: var(--vscode-foreground); }
.color-blue    { --node-bg: #1e3a5f; --node-border: #4a90d9; --node-text: #90c4f9; }
.color-green   { --node-bg: #1a3a1a; --node-border: #4a9a4a; --node-text: #90d490; }
.color-red     { --node-bg: #3a1a1a; --node-border: #c84040; --node-text: #f09090; }
.color-yellow  { --node-bg: #3a3a1a; --node-border: #c8a840; --node-text: #f0d490; }
.color-purple  { --node-bg: #2a1a3a; --node-border: #8040c8; --node-text: #c090f0; }
.color-gray    { --node-bg: #333;    --node-border: #666;    --node-text: #aaa;    }
```

---

## 9. Data Bridge: DiagramDocument ↔ React Flow

### 9.1 `docToFlow.ts` — DiagramDocument → React Flow State

```typescript
import type { Node, Edge } from '@xyflow/react';
import type { DiagramDocument } from '../../types/DiagramDocument';

export function docToFlowNodes(doc: DiagramDocument): Node[] {
  return doc.nodes.map((n) => ({
    id: n.id,
    type: 'diagramNode',
    position: { x: n.x, y: n.y },
    data: {
      label: n.label,
      shape: n.shape,
      color: n.color,
      pinned: n.pinned,
      notes: n.notes,
      width: n.width,
      height: n.height,
    },
    width: n.width,
    height: n.height,
    draggable: true,
    selectable: true,
  }));
}

export function docToFlowEdges(doc: DiagramDocument): Edge[] {
  return doc.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'diagramEdge',
    label: e.label,
    animated: e.animated ?? false,
    data: { style: e.style, arrow: e.arrow },
  }));
}
```

### 9.2 `useGraphState.ts` — State Management Hook

This hook is the critical bridge. It:
1. Converts `DiagramDocument` to React Flow state when the extension sends `DOCUMENT_UPDATED`
2. Translates React Flow events back to protocol messages
3. Prevents re-render loops (extension sends doc → webview renders → no change → no message back)

```typescript
import { useCallback, useMemo, useRef } from 'react';
import { useNodesState, useEdgesState, addEdge, Connection } from '@xyflow/react';
import { docToFlowNodes, docToFlowEdges } from '../lib/docToFlow';
import type { DiagramDocument } from '../../types/DiagramDocument';

export function useGraphState(
  doc: DiagramDocument | null,
  bridge: { postMessage: (msg: any) => void },
) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const lastDocRef = useRef<string>('');

  // Sync document → React Flow state (idempotent)
  useMemo(() => {
    if (!doc) return;
    const docHash = JSON.stringify(doc);
    if (docHash === lastDocRef.current) return; // prevent loop
    lastDocRef.current = docHash;
    setNodes(docToFlowNodes(doc));
    setEdges(docToFlowEdges(doc));
  }, [doc]);

  // Event handlers → protocol messages
  const onNodeDragStop = useCallback((_event: any, node: any) => {
    bridge.postMessage({
      type: 'NODE_DRAGGED',
      id: node.id,
      position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
    });
  }, [bridge]);

  const onConnect = useCallback((connection: Connection) => {
    bridge.postMessage({
      type: 'ADD_EDGE',
      edge: { source: connection.source, target: connection.target },
    });
  }, [bridge]);

  const onNodesDelete = useCallback((deleted: any[]) => {
    bridge.postMessage({ type: 'DELETE_NODES', nodeIds: deleted.map((n) => n.id) });
  }, [bridge]);

  const onEdgesDelete = useCallback((deleted: any[]) => {
    bridge.postMessage({ type: 'DELETE_EDGES', edgeIds: deleted.map((e) => e.id) });
  }, [bridge]);

  const onAddNode = useCallback(() => {
    bridge.postMessage({
      type: 'ADD_NODE',
      node: { label: 'New Node', shape: 'rectangle', color: 'default' },
    });
  }, [bridge]);

  const onNodeLabelChange = useCallback((id: string, label: string) => {
    bridge.postMessage({ type: 'UPDATE_NODE_LABEL', id, label });
  }, [bridge]);

  const onRequestLayout = useCallback(() => {
    bridge.postMessage({ type: 'REQUEST_LAYOUT' });
  }, [bridge]);

  // ... export handlers (SVG, PNG, Open SVG)

  return {
    nodes, edges, onNodesChange, onEdgesChange,
    onNodeDragStop, onConnect, onNodesDelete, onEdgesDelete,
    onAddNode, onNodeLabelChange, onRequestLayout,
    // ... export handlers
  };
}
```

### 9.3 Preventing Re-render Loops

The critical invariant: the webview is **stateless**. The `.diagram` file is the single source of truth.

```
User action → postMessage → extension writes file → DOCUMENT_UPDATED → webview re-renders
```

The `lastDocRef` hash comparison in `useGraphState` prevents infinite loops: if the document hasn't changed, the React Flow state isn't updated, so no re-render, so no new messages.

### 9.4 Export: SVG with Embedded Metadata

The export flow changes slightly with React Flow. Instead of cloning the SVG element, we use React Flow's built-in `toObject()` method + manual SVG generation:

1. Get current viewport nodes/edges via `useReactFlow().toObject()`
2. Serialize the `.diagram` JSON into `<metadata><diagramflow:source>...</diagramflow:source></metadata>`
3. Build SVG string from the React Flow viewport (using the viewport transform)

Alternative (simpler): Continue using the `document.querySelector('.react-flow__renderer')` approach — React Flow renders to a real SVG element that can be serialized. The existing `buildExportSvg()` logic adapts with minimal changes.

---

## 10. Message Protocol Updates

### No Breaking Changes

The existing protocol already supports all needed messages. The only addition for the context menu:

```typescript
// NEW — optional addition for node property changes from context menu
| { type: 'UPDATE_NODE_SHAPE'; id: string; shape: NodeShape }
| { type: 'UPDATE_NODE_COLOR'; id: string; color: NodeColor }
| { type: 'UPDATE_NODE_PINNED'; id: string; pinned: boolean }
```

However, these can all be sent as `UPDATE_NODE_LABEL`-style messages that the extension maps to `update_node` ops. **Recommendation**: reuse the existing message types where possible. Only add new ones if the semantics differ.

Actually, the simplest approach is to add a single generic message:

```typescript
| { type: 'UPDATE_NODE_PROPS'; id: string; changes: Partial<DiagramNode> }
```

This maps directly to `{ op: 'update_node', id, changes }` in DiagramService with zero translation.

---

## 11. E2E Testing Strategy

### Three-Tier Model

| Tier | What | How | LLM? | Speed | Count |
|------|------|-----|------|-------|-------|
| **Tier 1: Unit** | Pure logic: converters, services, tools | Vitest + jsdom | No | <1s | 200+ |
| **Tier 2: Structural E2E** | Tab opens, commands exist, files sync, screenshots match | Playwright + CDP | No | ~2min | 30+ |
| **Tier 3: Visual LLM** | "Does this look right?" semantic checks | Playwright + Skills Proxy | **Yes** | ~30s | 3-5 |

### 11.1 Tier 1: Unit Tests (Existing + New)

**Existing** (keep all 179):
- DiagramService, SchemaValidator, LM Tools, svgMetadata, protocol

**New** (add ~30):
- `docToFlow.test.ts` — DiagramDocument → React Flow nodes/edges
- `useGraphState.test.ts` — hook event handlers (use React Testing Library)

Note: React component tests (DiagramNode, Toolbar) can use Vitest + jsdom + React Testing Library for isolated testing without React Flow canvas. Keep these focused on props/events, not visual rendering.

### 11.2 Tier 2: Structural E2E (No LLM)

These tests run in the VS Code Desktop via CDP. They cannot access the webview iframe DOM but can:
- Verify tabs open without errors
- Check commands in palette
- Verify filesystem side effects (`.diagram` file content after operations)
- Take screenshots for visual regression comparison

#### 11.2.1 Existing Tests (Keep / Adapt)

All 24 existing e2e tests remain valid. Minor adaptation for React-specific HTML may be needed.

#### 11.2.2 New Screenshot Tests

```typescript
// e2e/visual-regression.e2e.test.ts

test.describe('Visual Regression', () => {

  test('simple diagram renders correctly', async ({ vscPage }) => {
    await vscPage.openFile('simple.diagram');
    await vscPage.page.waitForTimeout(4000); // wait for React Flow to render

    // Screenshot the entire editor area (avoids cross-origin iframe issue)
    const editorArea = vscPage.page.locator('.editor-group-container');
    await expect(editorArea).toHaveScreenshot('simple-diagram.png', {
      maxDiffPixels: 500,
      // Mask dynamic elements
      mask: [
        vscPage.page.locator('.minimap'), // minimap position may vary
      ],
    });
  });

  test('empty diagram shows clean canvas', async ({ vscPage }) => {
    await vscPage.openFile('empty.diagram');
    await vscPage.page.waitForTimeout(3000);

    const editorArea = vscPage.page.locator('.editor-group-container');
    await expect(editorArea).toHaveScreenshot('empty-diagram.png', {
      maxDiffPixels: 200,
    });
  });

  test('complex diagram with all node shapes renders', async ({ vscPage }) => {
    await vscPage.openFile('complex.diagram');
    await vscPage.page.waitForTimeout(4000);

    const editorArea = vscPage.page.locator('.editor-group-container');
    await expect(editorArea).toHaveScreenshot('complex-diagram.png', {
      maxDiffPixels: 800,
    });
  });
});
```

#### 11.2.3 File-System Side Effect Tests

These verify that user actions in the canvas actually modify the `.diagram` file:

```typescript
// e2e/file-sync.e2e.test.ts

test('adding a node updates the .diagram file', async ({ vscPage }) => {
  await vscPage.openFile('simple.diagram');
  await vscPage.page.waitForTimeout(3000);

  // Execute the add node command
  await vscPage.executeCommand('DiagramFlow: New Diagram'); // or via toolbar click

  // Read the .diagram file and verify new node was added
  const content = fs.readFileSync(simpleDiagramPath, 'utf-8');
  const doc = JSON.parse(content);
  // Verify expected state
});
```

#### 11.2.4 Playwright Config Updates

```typescript
// playwright.config.ts additions
export default defineConfig({
  // ... existing config
  expect: {
    toHaveScreenshot: {
      maxDiffPixels: 500,
      // Consistent rendering environment
      animations: 'disabled',
    },
  },
  use: {
    // ... existing use
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
```

### 11.3 Tier 2b: Screenshot Baselines

**Workflow**:

1. First run: `xvfb-run -a npx playwright test --update-snapshots`
   - Generates baseline `.png` files in `e2e/*.e2e.test.ts-snapshots/`
2. Subsequent runs: `xvfb-run -a npx playwright test`
   - Compares against baselines with pixel tolerance
3. After intentional UI changes: re-run `--update-snapshots`

**Determinism requirements**:
- Always run under `xvfb-run` (fixed virtual display)
- Fixed viewport via Playwright config: `{ width: 1280, height: 720 }`
- Disable animations in React Flow for screenshot stability
- Use `stylePath` to hide timestamp/clock elements in VS Code chrome

---

## 12. LLM Visual Verification Tests

### 12.1 Concept

Use the **VS Code Skills Proxy** (OpenAI-compatible API at `http://127.0.0.1:18080`) to ask an LLM to verify what a diagram screenshot contains. This is a semantic check: "Does this screenshot show X?" — something pixel comparison cannot answer.

### 12.2 Design Constraints

- **Rate limited**: Max 3-5 LLM calls per test suite run
- **Tagged**: All LLM tests marked with `@llm` tag, skipped by default
- **Opt-in**: Only run when `RUN_LLM_TESTS=true` env var is set
- **Tolerant**: LLM answers are probabilistic — allow soft assertions with retries
- **Focused**: Each LLM call asks one specific, answerable question

### 12.3 LLM Test Helper

```typescript
// e2e/helpers/llm-visual-verify.ts

const SKILLS_PROXY_URL = process.env.SKILLS_PROXY_URL ?? 'http://127.0.0.1:18080';
const MAX_LLM_CALLS = 5;
let llmCallCount = 0;

export function isLLMTestEnabled(): boolean {
  return process.env.RUN_LLM_TESTS === 'true';
}

export function remainingLLMCalls(): number {
  return MAX_LLM_CALLS - llmCallCount;
}

/**
 * Sends a screenshot to the LLM and asks a yes/no verification question.
 * Returns the LLM's answer as a string.
 *
 * The prompt should be a specific question like:
 * "Does this screenshot show a diagram with 3 nodes labeled Client, Auth Service, and Database?"
 *
 * IMPORTANT: This consumes one LLM call from the budget.
 */
export async function verifyScreenshotWithLLM(
  screenshotBuffer: Buffer,
  verificationPrompt: string,
): Promise<{ answer: string; passed: boolean }> {
  if (llmCallCount >= MAX_LLM_CALLS) {
    throw new Error(`LLM call budget exhausted (${MAX_LLM_CALLS} calls used)`);
  }
  llmCallCount++;

  const base64 = screenshotBuffer.toString('base64');

  const response = await fetch(`${SKILLS_PROXY_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'copilot',
      messages: [
        {
          role: 'system',
          content: 'You are a visual verification assistant. You will receive a screenshot of a diagram editor and a question about it. Answer ONLY with "YES" or "NO" followed by a brief explanation (max 20 words).',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: verificationPrompt },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${base64}` },
            },
          ],
        },
      ],
      max_tokens: 50,
    }),
  });

  if (!response.ok) {
    throw new Error(`Skills proxy returned ${response.status}: ${await response.text()}`);
  }

  const result = await response.json();
  const answer = result.choices?.[0]?.message?.content?.trim() ?? '';
  const passed = answer.toUpperCase().startsWith('YES');

  return { answer, passed };
}
```

### 12.4 LLM Test Fixture

```typescript
// e2e/fixtures/llm-test-fixtures.ts

import { test as base } from './vscode-suite-fixtures';
import { isLLMTestEnabled } from '../helpers/llm-visual-verify';

// Extend the base test with LLM skip logic
export const llmTest = base.extend({});

// Auto-skip if LLM tests not enabled
llmTest.beforeEach(async ({}, testInfo) => {
  if (!isLLMTestEnabled()) {
    testInfo.skip(true, 'LLM tests disabled (set RUN_LLM_TESTS=true to enable)');
  }
});
```

### 12.5 LLM Visual Tests

```typescript
// e2e/visual-llm.e2e.test.ts

import { expect } from '@playwright/test';
import { llmTest as test } from './fixtures/llm-test-fixtures';
import { verifyScreenshotWithLLM, remainingLLMCalls } from './helpers/llm-visual-verify';

test.describe('@llm Visual Verification', { tag: '@llm' }, () => {

  test('simple diagram shows expected nodes and edges', async ({ vscPage }) => {
    test.skip(remainingLLMCalls() < 1, 'LLM budget exhausted');

    await vscPage.openFile('simple.diagram');
    await vscPage.page.waitForTimeout(5000);

    const editorArea = vscPage.page.locator('.editor-group-container');
    const screenshot = await editorArea.screenshot();

    const { passed, answer } = await verifyScreenshotWithLLM(
      screenshot,
      'Does this screenshot show a diagram with exactly 3 nodes? The nodes should be labeled "Start", "Process", and "End", connected with arrows.',
    );

    console.log(`LLM verification: ${answer}`);
    expect(passed).toBe(true);
  });

  test('empty diagram shows clean canvas without nodes', async ({ vscPage }) => {
    test.skip(remainingLLMCalls() < 1, 'LLM budget exhausted');

    await vscPage.openFile('empty.diagram');
    await vscPage.page.waitForTimeout(4000);

    const editorArea = vscPage.page.locator('.editor-group-container');
    const screenshot = await editorArea.screenshot();

    const { passed, answer } = await verifyScreenshotWithLLM(
      screenshot,
      'Does this screenshot show an empty diagram canvas with no nodes or edges? It should show a dotted grid background.',
    );

    console.log(`LLM verification: ${answer}`);
    expect(passed).toBe(true);
  });

  test('complex diagram has multiple node shapes', async ({ vscPage }) => {
    test.skip(remainingLLMCalls() < 1, 'LLM budget exhausted');

    await vscPage.openFile('complex.diagram');
    await vscPage.page.waitForTimeout(5000);

    const editorArea = vscPage.page.locator('.editor-group-container');
    const screenshot = await editorArea.screenshot();

    const { passed, answer } = await verifyScreenshotWithLLM(
      screenshot,
      'Does this screenshot show a diagram with multiple different node shapes (rectangles, rounded boxes, diamonds, and/or cylinders)?',
    );

    console.log(`LLM verification: ${answer}`);
    expect(passed).toBe(true);
  });
});
```

### 12.6 Fallback: Text-Only LLM Verification

If the VS Code Skills Proxy does not support multimodal (image) inputs, use a text-only fallback that verifies diagram structure without screenshots:

```typescript
/**
 * Text-only LLM verification: sends the .diagram JSON content
 * and asks the LLM to verify its structure matches expectations.
 */
export async function verifyDiagramStructureWithLLM(
  diagramJson: string,
  verificationPrompt: string,
): Promise<{ answer: string; passed: boolean }> {
  if (llmCallCount >= MAX_LLM_CALLS) {
    throw new Error(`LLM call budget exhausted`);
  }
  llmCallCount++;

  const response = await fetch(`${SKILLS_PROXY_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'copilot',
      messages: [
        {
          role: 'system',
          content: 'You are a diagram structure verifier. You will receive a JSON diagram document and a question. Answer ONLY "YES" or "NO" followed by a brief explanation.',
        },
        {
          role: 'user',
          content: `Diagram JSON:\n${diagramJson}\n\nQuestion: ${verificationPrompt}`,
        },
      ],
      max_tokens: 50,
    }),
  });

  const result = await response.json();
  const answer = result.choices?.[0]?.message?.content?.trim() ?? '';
  return { answer, passed: answer.toUpperCase().startsWith('YES') };
}
```

### 12.7 Running LLM Tests

```bash
# Normal test run (LLM tests skipped)
xvfb-run -a npx playwright test --workers=1

# With LLM tests enabled
RUN_LLM_TESTS=true xvfb-run -a npx playwright test --workers=1

# Run only LLM tests
RUN_LLM_TESTS=true xvfb-run -a npx playwright test --grep @llm --workers=1
```

---

## 13. Migration Plan

### Phase 1: Setup (1 task)

1. **Install React + React Flow dependencies**
   ```bash
   npm install react react-dom @xyflow/react
   npm install -D @types/react @types/react-dom
   ```
2. **Update esbuild config** — add JSX support, CSS loader, React define
3. **Update `tsconfig.json`** — add `"jsx": "react-jsx"`, `"jsxImportSource": "react"`
4. **Update CSP** in `getWebviewContent.ts`
5. **Verify build** — `npm run build` succeeds with empty React entry

### Phase 2: Core Components (4 tasks)

1. **Create `src/webview/lib/docToFlow.ts`** + unit tests — the pure mapping layer
2. **Create `src/webview/hooks/useVSCodeBridge.ts`** — postMessage bridge hook
3. **Create `src/webview/hooks/useGraphState.ts`** — state management hook
4. **Create component files** — `index.tsx`, `App.tsx`, `CanvasPanel.tsx`, `DiagramNode.tsx`, `DiagramEdge.tsx`, `Toolbar.tsx`

### Phase 3: Feature Parity (3 tasks)

1. **Node drag** → `NODE_DRAGGED` message (match current behavior)
2. **Export SVG/PNG** → adapt existing `buildExportSvg` logic for React Flow
3. **Open SVG import** → reuse existing handler (no changes needed)

### Phase 4: New Features (3 tasks)

1. **Edge drawing** — `onConnect` → `ADD_EDGE` (uses existing protocol)
2. **Inline label editing** — double-click → input → `UPDATE_NODE_LABEL`
3. **Delete nodes/edges** — keyboard Delete → `DELETE_NODES`/`DELETE_EDGES`

### Phase 5: UI Polish (2 tasks)

1. **Context menu** — right-click node/edge for shape/color/pin/delete
2. **VS Code theming** — CSS variables, dark/light mode support

### Phase 6: Testing (3 tasks)

1. **Unit tests** — `docToFlow.test.ts`, component tests with React Testing Library
2. **Screenshot E2E** — baseline generation + pixel comparison tests
3. **LLM visual tests** — tagged `@llm`, rate-limited, opt-in

### Phase 7: Cleanup (1 task)

1. **Delete old webview files** — `src/webview/index.ts`, `src/webview/index.css`
2. **Update all e2e tests** if selectors changed
3. **Move `src/lib/svgMetadata.ts`** → `src/webview/lib/svgMetadata.ts` (or keep where it is)
4. **Package and verify** — `npm run package`, install VSIX, manual smoke test

### Total: ~17 tasks across 7 phases

---

## 14. Dependencies

### New Dependencies

```json
{
  "dependencies": {},
  "devDependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@xyflow/react": "^12.4.0"
  }
}
```

Notes:
- All are `devDependencies` because they're bundled by esbuild into `dist/webview/index.js`
- No runtime `dependencies` — the VSIX ships the bundled output
- `@xyflow/react` v12 is the current major version (renamed from `reactflow` v11)
- React 18.3 for `createRoot` API and concurrent features

### Version Constraints

- `@xyflow/react` requires React 17+ (we use 18)
- esbuild `^0.24.0` already supports `jsx: 'automatic'`
- VS Code `>=1.103.0` (required for Language Model Tools API — already in engines)

---

## 15. Decisions & Alternatives Considered

### D1: React vs Vanilla SVG

**Decision**: Replace vanilla SVG with React + React Flow.

**Challenge**: "Do we really need React? It adds 264KB to the bundle."

**Answer**: Yes. React Flow requires React. The alternative is building zoom, pan, edge drawing, minimap, node selection, multi-select, inline editing, and keyboard shortcuts from scratch in vanilla SVG — estimated 2000+ lines of fragile DOM manipulation code. React Flow provides all of this battle-tested, with 35K GitHub stars and 4.4M weekly installs. The 264KB bundle cost is a one-time load cached by VS Code's webview engine.

### D2: esbuild vs Vite/Webpack for React

**Decision**: Keep esbuild.

**Challenge**: "Should we switch to Vite for better React developer experience (HMR, etc.)?"

**Answer**: No. esbuild already supports JSX, CSS, and tree-shaking. Adding `jsx: 'automatic'` is a one-line change. The webview is loaded inside VS Code's Electron, not a browser — Vite's HMR wouldn't work anyway. Keeping esbuild maintains consistency with the existing build system and avoids adding another tool.

### D3: Webview Source Location

**Decision**: Keep files in `src/webview/` (current location).

**Challenge**: Spec v2 says `webview/` at package root.

**Answer**: The current implementation already uses `src/webview/` and the esbuild config references it. Moving would require updating build configs and test paths with zero benefit. Keep what works.

### D4: IIFE vs ESM for Webview Bundle

**Decision**: Keep `format: 'iife'`.

**Challenge**: Spec v2 suggests `format: 'esm'` for the webview.

**Answer**: VS Code webviews load scripts via `<script src="...">` without `type="module"`. IIFE format guarantees the script executes immediately. ESM would require `<script type="module">` which complicates the CSP and nonce handling. IIFE is the safer choice.

### D5: Node Shapes — CSS vs SVG

**Decision**: CSS shapes with `clip-path` for diamond, `border-radius` for rounded.

**Challenge**: Current implementation uses SVG shapes. React Flow nodes are HTML divs.

**Answer**: React Flow renders nodes as HTML `<div>` elements. Using CSS shapes integrates naturally with React Flow's handle positioning, selection borders, and resize features. The diamond shape uses `clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)` which is fully supported in Chromium (VS Code's webview engine). For the cylinder shape, we embed a small SVG inside the div.

### D6: Screenshot Testing Platform Consistency

**Decision**: All baselines generated and compared under `xvfb-run` on Linux.

**Challenge**: "Will screenshots be stable across machines?"

**Answer**: Yes, if the environment is consistent. `xvfb-run` provides a virtual framebuffer with deterministic rendering. Font rendering may vary by Linux distribution, but within a CI/CD pipeline the same Ubuntu version is used consistently. Playwright's `maxDiffPixels` tolerance (500-800px) absorbs minor rendering differences.

### D7: LLM Tests — Vision vs Text-Only

**Decision**: Support both vision (multimodal) and text-only verification.

**Challenge**: "Does the VS Code Skills Proxy support image inputs?"

**Answer**: Uncertain. The proxy translates OpenAI-format messages to `vscode.lm` API calls. VS Code's Language Model API supports text parts natively; multimodal support depends on the model behind Copilot. The spec provides both approaches: vision-based (screenshot → LLM) and text-based (.diagram JSON → LLM). Test code tries vision first, falls back to text-only.

### D8: Context Menu Implementation

**Decision**: Custom HTML div overlay, not a VS Code native menu.

**Challenge**: "Can we use VS Code's context menu API?"

**Answer**: No. The webview is an iframe — it cannot access VS Code's native context menu API. Custom HTML context menus are standard practice in VS Code webviews (used by draw.io, Excalidraw extensions). Position at cursor coordinates, close on blur/escape.

### D9: Export SVG Strategy

**Decision**: Serialize React Flow's rendered SVG + embed `.diagram` JSON metadata.

**Challenge**: "How do we export SVG from a React Flow canvas?"

**Answer**: Two approaches: (a) Use `document.querySelector('.react-flow__renderer')` to find React Flow's SVG element, clone and serialize it. (b) Build SVG manually from the `.diagram` JSON (same as current vanilla approach). Approach (a) is more accurate (captures actual rendered positions), approach (b) is more reliable (no DOM dependency). **Recommendation**: Use (a) for the SVG content and (b) for the metadata embedding. This preserves the existing round-trip import capability.

---

*End of specification. This document fully specifies the React Flow migration, UI/UX improvements, and visual E2E testing strategy for DiagramFlow.*
