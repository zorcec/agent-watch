# DiagramFlow — Miro-Parity Canvas Tools Specification

**Version:** 1.0  
**Date:** 2026-03-04  
**Status:** Implementation Target

---

## 1. Overview

This document specifies the behavioral improvements needed to make DiagramFlow's canvas tools feel
as intuitive as Miro's. The goal is not to clone Miro, but to adopt the UX patterns users already
have muscle memory for when working with modern visual collaboration tools.

---

## 2. Current Tools Inventory

| Tool | Shortcut | Current Behavior |
|---|---|---|
| **Hand / Select** | Esc | Pan canvas; Space to temporarily hold. Selected by default. |
| **Node** | N | Click canvas to place a diagram node (rectangle/rounded/diamond/cylinder). |
| **Note** | — | Click canvas to place a sticky note (shape=note, always yellow). |
| **Group** | G | Create a group container immediately. |
| **Text** | — | Click canvas to place a free-form text annotation. |
| **Image** | — | Prompts for URL then click to place. |
| **Connection** | (drag handles) | Drag from fixed node handles (4 per node). |
| **Undo / Redo** | Ctrl+Z / Ctrl+Shift+Z | History buttons in toolbar + keyboard. |
| **Sort** | — | Auto-layout nodes in reading order. |
| **Search** | Ctrl+F | Filter nodes by label. |

---

## 3. Miro Reference Behaviors

### 3.1 Select / Hand Tools — Miro's Defaults

**Miro:** Two distinct modes
- **Select (V)** — click to select single item; drag on empty canvas for box select; drag selected items to move.
- **Hand (H)** — pan canvas only; cannot select.
- Space bar temporarily activates Hand while held.
- After placing any shape/tool, Miro returns to **Select** mode.

**Our current gap:** We conflate Hand and Select. Toolbox `null` or `'hand'` mode both allow panning and selecting, but the cursor affordance is inconsistent.

**Required change:** After placing any element (node, note, text, image), automatically return to `null` (select/hand) mode. This already happens — no change needed.

---

### 3.2 Shapes / Nodes — Miro Behavior

**Miro:**
1. Click shape type in toolbar → cursor becomes crosshair icon.
2. Click on canvas → shape placed, immediately enters **inline text editing**.
3. Press `Escape` or click away → confirms text; returns to Select mode.
4. **Single-click on selected node** → starts inline text editing (no double-click needed).
5. Node resizes to fit content by default (auto-size); can be manually resized.
6. Right-click on node → context menu with: Edit, Copy, Paste, Duplicate, Delete, Change shape.
7. **Alt+drag** selected node → duplicates it.
8. Hovering over a node reveals **ghost connection handles** (blue circles at edge midpoints).

**Our current gap:**
- Requires **double-click** to edit label (vs single click after selection).
- No context menu on right-click.
- No Alt+drag to duplicate.
- Handles are always visible (not just on hover).

**Required changes — see §5.**

---

### 3.3 Sticky Notes — Miro Behavior

**Miro:**
1. Click sticky note in toolbar → cursor becomes crosshair.
2. Click on canvas → note placed **already in text-editing mode**.
3. Notes come in multiple colors (yellow, orange, blue, pink, green, purple). A **color palette popover** appears next to the placed note.
4. **Double-click** existing note → enters text-edit.
5. Note text wraps; note does NOT auto-resize (text clips at the border).
6. Note has no connection handles (sticky notes are not connectable to edges by default in Miro free tier).

**Our current gap:**
- Notes are always yellow; no color selection.
- Notes require double-click to edit (same as nodes).
- Notes have connection handles (they shouldn't in note-semantics, though keeping them is fine for diagramming use).

**Required changes:** Color picker when placing a note (colors: yellow, orange, blue, green, red, purple).

---

### 3.4 Connections (Edges) — Miro Behavior

**Miro:**
1. Hovering over a node reveals four **ghost handle circles** (blue) at top/right/bottom/left midpoints.
2. Drag from a ghost handle → line follows cursor.
3. Hovering over a target node → target glows green and shows snap zones.
4. Release over target → connection created, snaps to closest edge.
5. **Double-click on an edge** → opens inline text input centered on the edge label position for editing the label.
6. **Click on edge** → selects it; shows two endpoint drag handles and route control points.
7. Drag an existing edge endpoint → reconnects to a different node (ReactFlow `reconnectable` already supports this).
8. Right-click on edge → context menu: Edit label, Change style (solid/dashed/dotted), Toggle animated, Delete.
9. Edge line style defaults to **curved/smooth-step** (same as our current implementation).
10. **Arrow direction options**: forward, backward, both, none.

**Our current gap:**
- Handles are ALWAYS visible (four fixed circles per node). Miro shows them only on hover.
- **No inline edge label editing** — labels can only be changed via the Properties Panel.
- No right-click context menu on edges.

**Required changes:**
- Make node handles visible only on hover (CSS: `opacity:0` by default, `opacity:1` on `.react-flow__node:hover`).
- Add inline edge label editing: double-click on edge label area → editable text input.
- Add edge label via double-click on empty edge path area.

---

### 3.5 Text Elements — Miro Behavior

**Miro:**
1. Select Text tool (T) → cursor changes to text cursor.
2. Click on canvas → text box placed with cursor active inside it; begin typing immediately.
3. Press `Escape` or click away → confirms text; returns to Select mode.
4. **Double-click** on existing text element → edits it.
5. Text box has formatting: bold, italic, underline, font size, alignment.
6. Border appears only when selected or editing; otherwise transparent.

**Our current gap:**
- Currently requires double-click to edit (same as nodes). Acceptable.
- No formatting toolbar appears during text editing.

**Required changes:** No change needed (acceptable difference). Text formatting is already in Properties Panel.

---

### 3.6 Images — Miro Behavior

**Miro:**
1. Upload → open file picker.
2. Or paste image from clipboard → auto-placed on canvas.
3. Or drag-and-drop image file from OS onto canvas.
4. Image has rounded corners.
5. Caption/description shown below image.
6. Resize via corner drag handles.

**Our current gap:**
- Only supports URL input (via `window.prompt`).
- No clipboard paste of image data.
- No file upload.

**Required changes:** Replace `window.prompt` image URL input with a proper inline panel or modal that also allows image URL entry. (Full clipboard paste / file upload is VS Code webview sandbox limitation — skip for now.)

---

### 3.7 Groups (Frames) — Miro Behavior

**Miro:**
1. Frame tool (F) → drag to draw a frame area on canvas.
2. Elements inside the frame area automatically become children.
3. Frame label shown at top-left.
4. Resize frame → children move proportionally.
5. Single-click frame header → selects the frame; drag header → moves whole frame+children.

**Our current gap:**
- Currently add group places a 400×300 box at center, not drag-to-draw.
- This is acceptable for diagramming workflow.

**Required changes:** None required. Our groups serve the same purpose adequately.

---

### 3.8 Double-Click Empty Canvas — Miro Behavior

**Miro:** Double-click on an empty area of the canvas → creates a **text element** at click position and enters edit mode immediately.

**Our current gap:** Double-click on empty canvas does nothing.

**Required change:** Handle `onPaneDoubleClick` → call `onAddTextAt(x, y)` and then the TextElementNode auto-focuses.

---

## 4. Summary of Gaps → Implementation Items

| # | Gap | Priority | Effort |
|---|-----|----------|--------|
| G1 | Node handles visible only on hover (not always) | High | Low |
| G2 | Inline edge label editing (double-click on edge) | High | Medium |
| G3 | Sticky note color picker when placing | Medium | Low |
| G4 | Alt+drag to duplicate selected node | High | Low |
| G5 | Right-click context menu on nodes | Medium | Medium |
| G6 | Right-click context menu on edges | Medium | Medium |
| G7 | Double-click empty canvas → add text | Medium | Low |
| G8 | Node label edit on single-click after select | Low | Medium |
| G9 | Replace `window.prompt` for image URL | Medium | Low |

---

## 5. Detailed Implementation Specifications

### 5.1 G1 — Node Handles: Hover-Only Visibility

**Files to change:**
- `src/webview/styles/canvas.css`

**Behavior:**
- ReactFlow renders `.react-flow__handle` elements.
- By default they are small visible circles.
- Make them invisible unless the node is hovered.

**CSS rule:**
```css
.react-flow__handle {
  opacity: 0;
  transition: opacity 0.15s ease;
}
.react-flow__node:hover .react-flow__handle,
.react-flow__node.selected .react-flow__handle {
  opacity: 1;
}
/* Keep handles visible while dragging an edge */
.react-flow__node.react-flow__node-connecting .react-flow__handle {
  opacity: 1;
}
```

---

### 5.2 G2 — Inline Edge Label Editing

**Files to change:**
- `src/webview/components/DiagramEdge.tsx` — add double-click → inline label input state
- `src/webview/hooks/useGraphState.ts` — `onEdgeLabelChange` callback
- `src/webview/components/CanvasPanel.tsx` — wire `onEdgeLabelChange` via `nodesWithCallbacks` equivalent for edges

**Behavior:**
1. Double-click anywhere on an edge path (or its existing label) → an `<input>` appears at the label position (center of edge).
2. User types the new label.
3. Press `Enter` or blur → commit label change via `data.onLabelChange?.(id, draft)`.
4. Press `Escape` → discard; revert to previous label.
5. If no label existed before, creating one establishes a new label.

**DiagramEdge state:**
```tsx
const [editingLabel, setEditingLabel] = useState(false);
const [labelDraft, setLabelDraft] = useState('');

const handleEdgeDoubleClick = (e: React.MouseEvent) => {
  e.stopPropagation();
  setLabelDraft(typeof label === 'string' ? label : '');
  setEditingLabel(true);
};
const commitLabel = () => {
  setEditingLabel(false);
  data?.onLabelChange?.(id, labelDraft);
};
```

**New callback in `useGraphState`:**
```typescript
const onEdgeLabelChange = useCallback((id: string, label: string) => {
  bridge.postMessage({ type: 'UPDATE_EDGE_PROPS', id, changes: { label } });
}, [bridge]);
```

**Edge data type extension** — `DiagramEdgeData` needs `onLabelChange?: (id: string, label: string) => void`.

**Wiring in CanvasPanel:** edges need callbacks injected similar to nodes. Create a `edgesWithCallbacks` memo that injects `onLabelChange`.

---

### 5.3 G3 — Sticky Note Color Picker

**Files to change:**
- `src/webview/components/CanvasPanel.tsx` — add color selection step when `note` tool active
- `src/webview/hooks/useGraphState.ts` — `onAddNoteAt(x, y, color?)` signature extension
- Extension host messages and operations — `color` param already on nodes

**Behavior:**
1. User clicks "Note" toolbar button → toolbar button gets active state (already done).
2. A **color palette** appears in a floating panel near the toolbar showing 6 colors.
3. User clicks a color (or keeps default yellow) → then clicks canvas to place note with that color.
4. After placement, returns to hand mode.

**Note colors:** `yellow`, `orange`, `blue`, `green`, `red`, `purple` (map to existing `NodeColor` type).

**Implementation:** Add a `pendingNoteColorRef` similar to `pendingImageDataRef`. Show a `NoteColorPicker` panel component when `toolboxMode === 'note'`.

---

### 5.4 G4 — Alt+Drag to Duplicate

**Files to change:**
- `src/webview/components/CanvasPanel.tsx` — detect Alt key during node drag
- `src/webview/hooks/useGraphState.ts` — add `onDuplicateNode(id: string, offsetX: number, offsetY: number)` 
- `src/webview/hooks/useVSCodeBridge.ts` — new message type `DUPLICATE_NODE`
- Extension host `DiagramService` — handle `DUPLICATE_NODE` message

**Behavior:**
1. User holds `Alt` and drags a node.
2. On drag-start (`onNodeDragStart`), if `event.altKey === true`, set a flag `isDuplicating`.
3. On drag-stop (`onNodeDragStop`), if flag is set: instead of moving, call `onDuplicateNode(id, newX, newY)`.
4. The original node stays in its original position; a new node with the same label/shape/color is created at the drag-drop position.

**Note:** If the user drags many nodes with Alt, duplicate all of them. Keep it simple: only support single-node Alt+drag in v1.

---

### 5.5 G5/G6 — Right-Click Context Menu

**Files to change:**
- New file: `src/webview/components/ContextMenu.tsx`
- `src/webview/components/CanvasPanel.tsx` — capture `onNodeContextMenu`, `onEdgeContextMenu`, `onPaneContextMenu`
- `src/webview/hooks/useGraphState.ts` — add `onDuplicateNode`, confirm delete actions

**Node context menu items:**
- ✏️ Edit label
- 📋 Copy
- 📄 Duplicate
- 🗑️ Delete
- (if in group) ⬡ Remove from group

**Edge context menu items:**
- ✏️ Edit label
- Toggle style: Solid / Dashed / Dotted
- Toggle direction: → / ← / ↔ / —
- 🗑️ Delete

**Implementation:**
```tsx
// ContextMenu.tsx — absolute positioned div
interface ContextMenuProps {
  x: number;
  y: number;
  items: { label: string; icon?: string; action: () => void; separator?: boolean }[];
  onClose: () => void;
}
```

Position the menu at `(x, y)`, close on click-outside or Escape.

---

### 5.6 G7 — Double-Click Empty Canvas → Add Text

**Files to change:**
- `src/webview/components/CanvasPanel.tsx` — add `onPaneDoubleClick` handler

**Behavior:**
1. User double-clicks on empty canvas area (no node/edge under cursor).
2. `onAddTextAt(x, y)` is called.
3. TextElementNode is created and auto-focuses for immediate typing.

**Implementation:**
```tsx
const handlePaneDoubleClick = useCallback(
  (event: React.MouseEvent) => {
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    graph.onAddTextAt(position.x, position.y);
  },
  [screenToFlowPosition, graph],
);
// In ReactFlow: onPaneDoubleClick={handlePaneDoubleClick}
```

---

### 5.7 G9 — Better Image URL Input

**Files to change:**
- `src/webview/components/CanvasPanel.tsx` — replace `window.prompt` with a `ImageUrlDialog` panel

**Behavior:**
1. User clicks "Image" in toolbar → a small floating panel appears (like the note color picker for G3).
2. Panel has: URL input field, "Description" input field, "Place" button, close button.
3. User fills in URL → clicks "Place" → cursor becomes crosshair → click canvas to place.
4. Panel dismisses on close or Escape.

**Component:**
```tsx
// Inline in CanvasPanel or extracted as ImageInputPanel.tsx
```

---

## 6. Files Summary

| File | Change Type | Items |
|---|---|---|
| `styles/canvas.css` | Edit | G1 (handle hover) |
| `components/DiagramEdge.tsx` | Edit | G2 (inline label edit) |  
| `components/DiagramNode.tsx` | Edit | — |
| `components/CanvasPanel.tsx` | Edit | G2, G3, G4, G5, G6, G7, G9 |
| `components/ContextMenu.tsx` | New | G5, G6 |
| `components/NoteColorPicker.tsx` | New | G3 |
| `components/ImageInputPanel.tsx` | New | G9 |
| `hooks/useGraphState.ts` | Edit | G2, G4, G7 |
| Extension host / Messages | Edit | G4 (duplicate node) |

---

## 7. Acceptance Criteria

| # | Criterion |
|---|-----------|
| AC1 | Node handles are invisible by default; appear when hovering a node |
| AC2 | Double-clicking an edge opens an inline text input at the label position; Enter confirms; Escape cancels |
| AC3 | Selecting "Note" tool shows a color palette; the chosen color is applied to the placed note |
| AC4 | Alt+dragging a node creates a duplicate at the drop position; original stays |
| AC5 | Right-clicking a node shows a context menu with Edit/Copy/Duplicate/Delete actions |
| AC6 | Right-clicking an edge shows a context menu with Edit label/style/delete actions |
| AC7 | Double-clicking empty canvas places a text element that immediately enters edit mode |
| AC8 | Clicking "Image" shows an inline panel (not `window.prompt`) for URL and description entry |
| AC9 | All existing tests continue to pass |
| AC10 | New unit tests cover G2 (edge label change dispatch), G4 (duplicate message), G7 (pane double-click) |

---

## 8. Out of Scope

- Clipboard paste of image data (VS Code webview sandbox limitation)
- OS file-drop onto canvas (VS Code webview sandbox limitation)
- Live collaboration / multi-user presence
- Miro AI features
- Miro template library
- Node auto-resize to content (complex, deferred)
