import { useReactFlow } from '@xyflow/react';

type ToolbarProps = {
  onAddNode: () => void;
  onAutoLayout: () => void;
  onExportSvg: () => void;
  onExportPng: () => void;
  onOpenSvg: () => void;
};

export function Toolbar({
  onAddNode,
  onAutoLayout,
  onExportSvg,
  onExportPng,
  onOpenSvg,
}: ToolbarProps) {
  const { fitView, zoomIn, zoomOut } = useReactFlow();

  return (
    <div className="toolbar" data-testid="toolbar">
      <div className="toolbar-group">
        <button
          onClick={onAddNode}
          title="Add Node (N)"
          data-testid="btn-add-node"
          className="toolbar-btn"
        >
          + Node
        </button>
      </div>
      <div className="toolbar-group">
        <button
          onClick={onAutoLayout}
          title="Auto Layout (L)"
          data-testid="btn-layout"
          className="toolbar-btn"
        >
          ⬡ Layout
        </button>
        <button
          onClick={() => fitView({ padding: 0.2 })}
          title="Fit View (F)"
          data-testid="btn-fit"
          className="toolbar-btn"
        >
          ⊞ Fit
        </button>
        <button
          onClick={() => zoomIn()}
          title="Zoom In (+)"
          className="toolbar-btn"
        >
          +
        </button>
        <button
          onClick={() => zoomOut()}
          title="Zoom Out (-)"
          className="toolbar-btn"
        >
          −
        </button>
      </div>
      <div className="toolbar-group">
        <button
          onClick={onOpenSvg}
          title="Import SVG"
          data-testid="btn-open"
          className="toolbar-btn"
        >
          ↑ Open
        </button>
        <button
          onClick={onExportSvg}
          title="Save as SVG"
          data-testid="btn-save-svg"
          className="toolbar-btn"
        >
          ↓ SVG
        </button>
        <button
          onClick={onExportPng}
          title="Save as PNG"
          data-testid="btn-save-png"
          className="toolbar-btn"
        >
          ↓ PNG
        </button>
      </div>
    </div>
  );
}
