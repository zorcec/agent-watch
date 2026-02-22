# Debugging the Sort Write Problem

## Symptom

The **DiagramFlow: Sort Nodes** command appeared to run (no error, no crash) but nodes never
moved and `meta.modified` was not updated in the `.diagram` file on disk. Running
the command multiple times produced no visible effect.

---

## Root Cause

### The Active Document goes `null` when the command palette opens

The extension tracks which `.diagram` file is currently open via
`DiagramService.activeDocument`. This reference is managed by `DiagramEditorProvider`:

| Event | Action |
|---|---|
| Webview resolved (`resolveCustomTextEditor`) | `setActiveDocument(document)` |
| Webview disposed / hidden | `setActiveDocument(null)` |
| View becomes visible again (`onDidChangeViewState`) | `setActiveDocument(document)` |

When the user opens the VS Code command palette (`Control+Shift+P` or
`Control+P > `), VS Code signals the webview that it is no longer the active
panel (`webviewPanel.visible = false`). The `onDidChangeViewState` listener fires
and the dispose path calls `setActiveDocument(null)`.

By the time `diagramflow.sortNodes` runs (after the user selects the command),
`getActiveDocument()` returns `null`. `sortNodes()` falls through without a
document target and the operation is a no-op — nothing written to disk.

---

## Debugging Steps

### 1. Confirm the write never happens

Added a temporary `fs.appendFileSync` probe inside `writeDocumentToFile` in
`DiagramService.ts`:

```typescript
fs.appendFileSync('/tmp/diagramflow-debug.log',
  `[${new Date().toISOString()}] write called, doc=${doc?.fileName ?? 'null'}\n`);
```

After running Sort Nodes, the log file showed no write was attempted — confirming
the operation never reached the file-write path.

### 2. Trace back to `getActiveDocument()`

Added a second probe just inside `sortNodes()`:

```typescript
fs.appendFileSync('/tmp/diagramflow-debug.log',
  `sortNodes called, active=${this.getActiveDocument()?.fileName ?? 'null'}\n`);
```

Log showed `active=null` every time Sort Nodes ran via the command palette, but
`active=/path/to/file.diagram` when triggered programmatically in tests. This
confirmed the command palette focus-loss was the cause.

### 3. Identify the focus-loss trigger

Examined `DiagramEditorProvider.ts` — the `onDidChangeViewState` listener clears
`activeDocument` when `webviewPanel.visible` becomes `false`. Opening the command
palette makes the webview invisible momentarily, clearing the reference before the
command handler runs.

---

## Fix

Added a fallback document lookup in the `diagramflow.sortNodes` command handler
(`extension.ts`):

```typescript
vscode.commands.registerCommand('diagramflow.sortNodes', () => {
  // Command palette focus-loss may clear activeDocument.
  // Fall back to any open .diagram file so sort still works.
  if (!diagramService.getActiveDocument()) {
    const fallback = vscode.workspace.textDocuments.find(
      (d) => d.fileName.endsWith('.diagram') && !d.isClosed,
    );
    if (fallback) {
      diagramService.setActiveDocument(fallback);
    }
  }
  diagramService.sortNodes();
}),
```

The same fallback was added to `diagramflow.autoLayout` for the same reason.

---

## Related: E2E Test Strategy

The E2E tests (`sort.e2e.test.ts`) verify sort persistence by reading the file
from disk after the command runs. Two important strategies emerged from debugging:

1. **`backupAndRestore`** — save the fixture file before the test, restore after.
   This avoids writing to the fixture before opening (which triggers VS Code's
   external-file-change detection and disrupts the editor state).

2. **`executeCommand` via `Control+P > `** — the helper opens the file quick-open
   (`Ctrl+P`) and prepends `>` to switch into command mode. This is equivalent to
   `Ctrl+Shift+P` but more robust in headless Playwright environments where
   keyboard shortcuts can be intercepted.

---

## Lessons Learned

- **VS Code custom editors lose `activeDocument` focus when the command palette
  opens.** Always add a fallback lookup for commands that need the active document
  but are invoked globally (not from the webview context).
- **Disk log probes (`fs.appendFileSync`) are the fastest way to confirm whether
  a write path is even reached** when VS Code's debug console is hard to attach in
  E2E contexts.
- **Use `workspace.textDocuments` as a fallback** — VS Code keeps open text
  documents in this array even when the webview tab is not focused.
