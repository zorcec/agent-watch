For fetching the websites use the webcrawl-fetch tool.

## Architecture Diagram Reference

- The project architecture is documented in [architecture.diagram](architecture.diagram).
- This diagram provides a visual overview of all major components, their relationships, and operational flow.
- All agents MUST read and understand the diagram before starting any project-related tasks.
- Agents MUST keep the diagram up to date using the DiagramFlow tools; never modify the diagram file directly.

**Diagram Description:**
- Illustrates the extension entry, DiagramEditorProvider, DiagramService, LM tools, core libraries, and webview components.
- Shows how user actions, Copilot, and tools interact with the extension and diagram services.
- Essential for understanding dependencies and operational flow.

## User Input
- Always try to use what used 3rd parties offer before implementing custom solutions. For example, ReactFlow provides built-in support for box selection and edge reconnection, so leverage those features instead of building them from scratch.
- Be curious and proactive in finding ways to enhance the user experience. If you identify a potential improvement, such as adding multi-node selection or snap-to-grid functionality, take the initiative to research it in details and document your findings in the ideas.md file. This will help us keep track of potential enhancements and prioritize them effectively.