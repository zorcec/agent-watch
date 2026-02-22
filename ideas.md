
## Pending Implementation

> Ideas that have been implemented are removed from this list.
> Ideas marked **[SKIP]** are archived at the bottom.

### 1. Node Templates / Quick-Add Panel
**Priority: High**
Re-typing common node labels and choosing shapes/colors is repetitive. A node template library (database, API gateway, frontend app, queue, service, etc.) would speed up diagram creation significantly.

Spec:
- Define a `NodeTemplate[]` array in config (label pattern, shape, color, notes template)
- Toolbar button or `T` keyboard shortcut opens a quick-pick popup
- Selecting a template inserts a new node with those defaults
- Allow user-defined templates stored in VS Code workspace settings (`diagramflow.nodeTemplates`)

---

### 2. Alignment Guides (Smart Snap)
**Priority: Medium**
When dragging a node, show temporary alignment guide lines when the node's edges align with nearby nodes (similar to Figma/Excalidraw). This makes manual layout much cleaner.

Spec:
- During `onNodeDrag` (not just stop), compute horizontal and vertical alignment candidates from all other nodes
- Draw SVG guide lines (dashed lines) at matching positions
- Snap node position to the nearest guide within a threshold (e.g. 8px) before sending `NODE_DRAGGED`
- Implemented entirely in the webview — no extension changes needed

---

### 3. Edge Bundling (Parallel Edge Deduplication)
**Priority: Low**
When multiple edges connect the same pair of nodes, they overlap and become invisible. Bundling them with slight offsets (or displaying a count badge on a single edge) cleans up the visual.

Spec:
- Detect parallel edges in `docToFlowEdges` (same source+target or reverse)
- Assign each parallel edge a small perpendicular offset (bezier control point adjustment)
- Alternatively, show a label like `×3` when ≥3 parallel edges exist

---

### 4. Diagram Auto-Documentation
**Priority: Medium**
Use the Copilot LLM to generate structured documentation from a diagram — architecture decision records, system overview docs, or README sections.

Spec:
- Register VS Code command `diagramflow.generateDocs`
- Use `diagramflow_readDiagram` to get context, then ask LLM to generate one of: README section, ADR, C4 model description, or threat model
- Output to a new VS Code editor tab as Markdown
- Optionally persist the generated doc path in `diagram.meta`

---

### 5. Diagram Diff / Change Tracking
**Priority: Medium**
When a `.diagram` file is modified by an LLM agent or collaborator, it's hard to see what changed. A visual diff mode (highlight added/removed/changed nodes & edges) would help review.

Spec:
- Compare current document against git HEAD version using `git show HEAD:<file>`
- Highlight added nodes/edges in green, removed in red, changed in yellow
- Activated via `diagramflow.showDiff` command or a toolbar toggle
- Reset highlight when leaving diff mode

---

### 6. Zoom to Selection
**Priority: Low**
After selecting one or more nodes, pressing a key (e.g. `Z`) should zoom and pan so the selected nodes fill the viewport. Useful for navigating large diagrams.

Spec:
- Listen for `z` key in `CanvasPanel` keyboard handler
- If `selectedNodeId` or multiple selected nodes, call `rf.fitView({ nodes: selected, padding: 0.3 })`
- Add to shortcuts panel list

---

### 7. Multi-Diagram Navigation Panel
**Priority: Low**
When a workspace has multiple `.diagram` files, switching between them requires the file explorer. A dedicated panel listing all `.diagram` files in the workspace would improve discoverability.

Spec:
- Register a `TreeDataProvider` for a DiagramFlow sidebar view
- List all `*.diagram` files in the workspace
- Clicking opens the file in the custom editor
- Show node/edge/group counts as descriptions
- Refresh on file create/delete

---

### 8. Performance: Virtual Rendering for Large Diagrams
**Priority: Low**
ReactFlow already virtualises node rendering to some degree, but very large diagrams (500+ nodes) may still lag. Investigate the ReactFlow `<NodeRenderer>` lazy-rendering options and measure performance benchmarks.

Spec:
- Profile current rendering with 200, 500, 1000 nodes
- Evaluate `<ReactFlow onlyRenderVisibleElements>` prop
- Consider splitting very large diagrams into linked sub-diagrams
- Document findings in `information/` and implement if gain > 30%

---

### 9. Collaborative/Shared Cursors (Future / Research)
**Priority: Very Low**
If a team opens the same `.diagram` file via a shared workspace (VS Code Live Share), show collaborator cursors and selection on the canvas.

Spec:
- Requires VS Code Live Share API integration
- Broadcast cursor positions over the Live Share channel
- Render ghost cursors (colored rings) on the canvas for each collaborator
- Highly experimental — document feasibility in `information/`

---

## LLM / Agent Context Enrichment Ideas

> Research question: *What additional information can be stored in the diagram so an LLM agent understands the project architecture more accurately and makes better decisions?*
>
> **Implemented and removed from this list:** Semantic Node Type (`type`), C4 Abstraction Level (`abstractionLevel`), Edge Protocol + DataTypes, Node Lifecycle Status via `properties.status`, Diagram description via `meta.description`, Node security classification and deployment environment, glossary, tags, insights.

### 10. Technology / Stack Metadata
**Priority: Medium**
Knowing that `AuthService` is `Go` and `Frontend` is `React/TypeScript` is critical context for agents writing code. Free-text `notes` is lossy; a structured `tech` field is precise.

Spec:
- Add optional `tech?: string` to `DiagramNode` (e.g. `"TypeScript"`, `"PostgreSQL"`, `"Redis"`)
- Render as a chip/tag below the node label or in the tooltip
- Include in `agentContext.nodeIndex[].tech`
- PropertiesPanel: show a text input with autocomplete from a built-in well-known list

---

### 11. Source Code Path Linking (VS Code Command)
**Priority: Medium**
NodeProperties already has `repo`, `openapi`, and `adr` for documentation linking. The missing piece is a VS Code command that opens the linked resource directly from the diagram.

Spec (remaining work):
- Add optional `sourcePath?: string` to `NodeProperties` (workspace-relative glob, e.g. `"src/auth/**"`)
- Register VS Code command `diagramflow.openNodeSource` that opens the linked path via `vscode.workspace.openTextDocument` or `vscode.env.openExternal`
- Show "Open Source" in the NodeToolbar when `sourcePath` is set
- Include source paths in `agentContext.nodeIndex` so LLM agents can cite them

---

### 12. Topology Hints for LLM (Entry Points, Critical Paths)
**Priority: Low**
Surface structural insights — entry points (nodes with no inbound edges), leaf nodes, and longest directed paths — directly in `agentContext` so the LLM knows where to focus in large diagrams.

Spec:
- Compute topology analysis in `generateAgentContext`:
  - `entryPoints`: node IDs with in-degree 0
  - `leafNodes`: node IDs with out-degree 0
  - `longestPath`: sequence of node IDs on the longest directed path
- Include as a `topology` block in `agentContext`
- No UI required — purely consumed by LLM tool callers

---

### 13. Diagram-Level Team and Version Metadata
**Priority: Low**
`meta.description` and `meta.abstractionLevel` are implemented. The remaining fields from the original idea are `meta.team` (owning team) and `meta.docVersion` (semantic version of the diagram). These give the LLM context before it reads any nodes.

Spec:
- Add `meta.team?: string` — owning team name (e.g. `"Platform Squad"`)
- Add `meta.docVersion?: string` — semantic version of the diagram document (e.g. `"2.1.0"`)
- Include at the top of `agentContext.summary`
- Expose via a "Diagram Properties" settings command or meta editor

---

### 14. Runtime Scenario Documentation
**Priority: Medium**
Static diagrams show structure but not behavior. Annotating key runtime scenarios (user login flow, payment processing, error recovery) directly in the diagram metadata lets the LLM understand how components collaborate without reading source code.

Research source: Arc42 section 6 (Runtime View) — documents behavior as use-case scenarios.

Spec:
- Add `meta.scenarios?: { name: string; description: string; participants: string[] }[]`
- Each scenario names the nodes involved and describes the interaction in plain text
- Include in `agentContext` as a `## Key Scenarios` section
- UI: a collapsible "scenarios" editor in the Diagram Properties panel

---

### 15. Change Volatility Tagging
**Priority: Low**
When an LLM agent proposes changes, it needs to know what's stable (shared infrastructure, public APIs) vs experimental (new features) to avoid breaking things. A `volatility` tag on nodes encodes this intent.

Spec:
- Add optional `volatility?: 'stable' | 'experimental' | 'legacy'` to `DiagramNode`
- Render as a subtle visual modifier (dimmed border for legacy, pulse animation for experimental)
- Include in `agentContext.nodeIndex[].volatility`
- LM tool schemas updated: `diagramflow_addNodes`, `diagramflow_updateNodes`

---

### 16. Diagram Staleness Tracking
**Priority: Low**
Architecture diagrams go stale quickly after code changes. Storing a `meta.lastValidated` date and surfacing staleness warnings helps the LLM know whether to trust the context.

Spec:
- Add `meta.lastValidated?: string` (ISO 8601 date) to `DiagramMeta`
- Register VS Code command `DiagramFlow: Mark as Validated` to set this date
- Show a warning banner in the webview if `lastValidated` is older than 30 days
- Include `lastValidated` in `agentContext.summary` preamble

---

### 17. Cross-Diagram References (Linked Sub-Diagrams)
**Priority: Low**
For large systems, a single `.diagram` file becomes unmanageable. Linking a node to a more-detailed `.diagram` file (drill-down) allows LLM agents to traverse the architecture hierarchically without loading all diagrams simultaneously.

Spec:
- Add optional `linkedDiagram?: string` to `DiagramNode` (workspace-relative path)
- Show a "drill-down" icon on nodes with a linked diagram
- VS Code command `diagramflow.openLinkedDiagram` to navigate to the linked file
- Include in `agentContext.nodeIndex[].linkedDiagram` so LLM tools can load sub-diagrams

---

## Archived (Skipped / Won't Implement)

### Connection Validation (isValidConnection)
Prevent invalid edges before creation. Deferred — the open-ended model is intentional for fast prototyping.

### Box-Select (Selection on Drag)
Shift-drag multi-selection via ReactFlow `selectionOnDrag`. Deferred — conflicts with panning UX and existing Shift+click selection is sufficient.
