For fetching the websites use the webcrawl-fetch tool.

## Running Tests

### Unit tests (fast, no display needed)
```sh
# From the monorepo root
npm test              # run once
npm run test:watch    # watch mode
npm run test:coverage # with coverage
```

### E2E tests (requires VS Code Desktop + a display server)
E2E tests launch a real VS Code Desktop instance via Playwright and need either a physical display or a virtual framebuffer (Xvfb) on Linux/CI.

```sh
# Linux / CI — use the Xvfb wrapper (recommended on headless servers)
npm run e2e:xvfb

# macOS / Windows or a machine with a real display
npm run e2e

# Headed mode — shows the browser window (useful for debugging)
npm run e2e:headed
```

**CI / headless environment notes:**
- `npm run e2e` calls `npx playwright test` directly; set `DISPLAY` before running if not using `e2e:xvfb`.
- `npm run e2e:xvfb` wraps the command with `xvfb-run --auto-servernum` and a 1920×1080 virtual screen — the safest choice on any headless Linux machine.
- Install Xvfb if missing: `sudo apt-get install -y xvfb`.
- Playwright config lives in `playwright.config.ts` at the repo root; `headless: true` is already set for all projects.

## Linting

The project uses **ESLint 10** with `typescript-eslint` strict + stylistic configuration (the community‑standard TypeScript linting setup, equivalent to `eslint-config-airbnb` for JavaScript projects).

### Running the linter

```sh
# From the monorepo root
npm run lint        # check only — reports all errors and warnings
npm run lint:fix    # auto-fix fixable issues (formatting, simple style)
```

### Agent requirement

**Agents MUST ensure `npm run lint` reports zero errors before submitting any changes.**

- Run `npm run lint:fix` after every batch of edits to auto-fix formatting issues.
- Run `npm run lint` to confirm 0 errors remain.
- Warnings (e.g. `@typescript-eslint/no-explicit-any`) are tolerated but should be minimised.

### Key rules

| Rule | Setting | Reason |
|---|---|---|
| `@typescript-eslint/no-explicit-any` | warn | VS Code API types require `any` in some places |
| `@typescript-eslint/no-non-null-assertion` | warn | VS Code API can legitimately need `!` |
| `@typescript-eslint/no-unused-vars` | error | `_`-prefixed params/vars are ignored |
| `no-empty-pattern` | off (e2e only) | Playwright requires `{}` fixture destructuring |
| `class-methods-use-this` | off | VS Code provider/tool class methods often don't use `this` |

### Config location

`eslint.config.mjs` at the repository root.

---

## Architecture Diagram Reference

- The project architecture is documented in [architecture.diagram](architecture.diagram).
- This diagram provides a visual overview of all major components, their relationships, and operational flow.
- Before beginning work, run the DiagramFlow tools (e.g. `diagramflow_getDiagram`) to programmatically read and inspect the diagram; the visual often holds key structural details.
- All agents MUST read and understand the diagram before starting any project-related tasks.
- Agents MUST keep the diagram up to date using the DiagramFlow tools; never modify the diagram file directly.

**Diagram Description:**
- Illustrates the extension entry, DiagramEditorProvider, DiagramService, LM tools, core libraries, and webview components.
- Shows how user actions, Copilot, and tools interact with the extension and diagram services.
- Essential for understanding dependencies and operational flow.

## User Input
- Always try to use what used 3rd parties offer before implementing custom solutions. For example, ReactFlow provides built-in support for box selection and edge reconnection, so leverage those features instead of building them from scratch.
- Be curious and proactive in finding ways to enhance the user experience. If you identify a potential improvement, such as adding multi-node selection or snap-to-grid functionality, take the initiative to research it in details and document your findings in the ideas.md file. This will help us keep track of potential enhancements and prioritize them effectively.