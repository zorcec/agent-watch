import { useReactFlow } from '@xyflow/react';
import type { LayoutDirection } from '../../types/DiagramDocument';

type ToolbarProps = {
  onAddNode: () => void;
  onAddNote: () => void;
  onAddGroup: () => void;
  onAutoLayout: () => void;
  onAutoLayoutForce: () => void;
  onExportSvg: () => void;
  onExportPng: () => void;
  onOpenSvg: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleSearch: () => void;
  onToggleShortcuts: () => void;
  layoutDirection: LayoutDirection;
  onSetLayoutDirection: (dir: LayoutDirection) => void;
};

export function Toolbar({
  onAddNode,
  onAddNote,
  onAddGroup,
  onAutoLayout,
  onAutoLayoutForce,
  onExportSvg,
  onExportPng,
  onOpenSvg,
  onUndo,
  onRedo,
  onToggleSearch,
  onToggleShortcuts,
  layoutDirection,
  onSetLayoutDirection,
}: ToolbarProps) {
  const { fitView, zoomIn, zoomOut } = useReactFlow();

  const toggleDirection = () =>
    onSetLayoutDirection(layoutDirection === 'TB' ? 'LR' : layoutDirection === 'LR' ? 'BT' : layoutDirection === 'BT' ? 'RL' : 'TB');

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
        <button
          onClick={onAddNote}
          title="Add Sticky Note"
          data-testid="btn-add-note"
          className="toolbar-btn"
        >
          📝 Note
        </button>
        <button
          onClick={onAddGroup}
          title="Add Group (G)"
          data-testid="btn-add-group"
          className="toolbar-btn"
        >
          ⬡ Group
        </button>
      </div>

      <div className="toolbar-group">
        <button
          onClick={onUndo}
          title="Undo (Ctrl+Z)"
          data-testid="btn-undo"
          className="toolbar-btn"
        >
          ↩ Undo
        </button>
        <button
          onClick={onRedo}
          title="Redo (Ctrl+Shift+Z)"
          data-testid="btn-redo"
          className="toolbar-btn"
        >
          ↪ Redo
        </button>
      </div>

      <div className="toolbar-group">
        <button
          onClick={toggleDirection}
          title={`Layout direction: ${layoutDirection} (click to cycle)`}
          data-testid="btn-layout-direction"
          className="toolbar-btn toolbar-btn--direction"
        >
          {layoutDirection === 'TB' ? '↕ TB' : layoutDirection === 'LR' ? '↔ LR' : layoutDirection === 'BT' ? '↕ BT' : '↔ RL'}
        </button>
        <button
          onClick={onAutoLayout}
          title="Auto Layout — repositions unpinned nodes (L)"
          data-testid="btn-layout"
          className="toolbar-btn"
        >
          ⬡ Layout
        </button>
        <button
          onClick={onAutoLayoutForce}
          title="Force Layout — repositions ALL nodes including pinned (Shift+L)"
          data-testid="btn-layout-force"
          className="toolbar-btn"
        >
          ⬡! Force
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

      <div className="toolbar-group toolbar-group--right">
        <button
          onClick={onToggleSearch}
          title="Search nodes (Ctrl+F)"
          data-testid="btn-search"
          className="toolbar-btn"
        >
          🔍
        </button>
        <button
          onClick={onToggleShortcuts}
          title="Keyboard shortcuts (?)"
          data-testid="btn-shortcuts"
          className="toolbar-btn"
        >
          ?
        </button>
      </div>
    </div>
  );
}
