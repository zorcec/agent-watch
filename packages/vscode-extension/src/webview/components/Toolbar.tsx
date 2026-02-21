import { Panel, useReactFlow } from '@xyflow/react';
import { useState, useRef, useEffect, type ReactNode } from 'react';
import type { LayoutDirection } from '../../types/DiagramDocument';

type ToolbarProps = {
  onAddNode: () => void;
  onAddNote: () => void;
  onAddGroup: () => void;
  onSortNodes: (direction: LayoutDirection) => void;
  onExportSvg: () => void;
  onExportPng: () => void;
  onExportMermaid: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleSearch: () => void;
  onToggleShortcuts: () => void;
  layoutDirection: LayoutDirection;
  onSetLayoutDirection: (dir: LayoutDirection) => void;
  selectedGroupId: string | null;
};

const DIRECTION_LABEL: Record<LayoutDirection, string> = {
  TB: '↕ TB',
  LR: '↔ LR',
  BT: '↕ BT',
  RL: '↔ RL',
};

const DIRECTION_SHORT: Record<LayoutDirection, string> = {
  TB: 'TB',
  LR: 'LR',
  BT: 'BT',
  RL: 'RL',
};

const DIRECTION_CYCLE: Record<LayoutDirection, LayoutDirection> = {
  TB: 'LR',
  LR: 'BT',
  BT: 'RL',
  RL: 'TB',
};

const ALL_DIRECTIONS: LayoutDirection[] = ['TB', 'LR', 'BT', 'RL'];

type ToolSectionProps = {
  label: string;
  children: ReactNode;
};

function ToolSection({ label, children }: ToolSectionProps) {
  return (
    <div className="toolbox-section" role="group" aria-label={label}>
      <span className="toolbox-section-label">{label}</span>
      <div className="toolbox-section-btns">{children}</div>
    </div>
  );
}

function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return { open, setOpen, ref };
}

export function Toolbar({
  onAddNode,
  onAddNote,
  onAddGroup,
  onSortNodes,
  onExportSvg,
  onExportPng,
  onExportMermaid,
  onUndo,
  onRedo,
  onToggleSearch,
  onToggleShortcuts,
  layoutDirection,
  onSetLayoutDirection,
  selectedGroupId,
}: ToolbarProps) {
  const { fitView } = useReactFlow();
  const sortDropdown = useDropdown();
  const exportDropdown = useDropdown();

  const toggleDirection = () => onSetLayoutDirection(DIRECTION_CYCLE[layoutDirection]);

  const sortLabel = selectedGroupId ? 'Sort In' : 'Sort';
  const sortTitle = selectedGroupId
    ? 'Sort nodes inside the selected group by reading order'
    : 'Sort top-level nodes and groups by reading order';

  return (
    <Panel position="top-left" className="toolbox" data-testid="toolbar">
      {/* Create */}
      <ToolSection label="Create">
        <button onClick={onAddNode} title="Add Node (N)" data-testid="btn-add-node" className="toolbox-btn">
          <span className="toolbox-btn-icon">＋</span>
          <span className="toolbox-btn-label">Node</span>
        </button>
        <button onClick={onAddNote} title="Add Sticky Note" data-testid="btn-add-note" className="toolbox-btn">
          <span className="toolbox-btn-icon">📝</span>
          <span className="toolbox-btn-label">Note</span>
        </button>
        <button onClick={onAddGroup} title="Add Group (G)" data-testid="btn-add-group" className="toolbox-btn">
          <span className="toolbox-btn-icon">⬡</span>
          <span className="toolbox-btn-label">Group</span>
        </button>
      </ToolSection>

      <div className="toolbox-divider" />

      {/* History */}
      <ToolSection label="History">
        <button onClick={onUndo} title="Undo (Ctrl+Z)" data-testid="btn-undo" className="toolbox-btn">
          <span className="toolbox-btn-icon">↩</span>
          <span className="toolbox-btn-label">Undo</span>
        </button>
        <button onClick={onRedo} title="Redo (Ctrl+Shift+Z)" data-testid="btn-redo" className="toolbox-btn">
          <span className="toolbox-btn-icon">↪</span>
          <span className="toolbox-btn-label">Redo</span>
        </button>
      </ToolSection>

      <div className="toolbox-divider" />

      {/* Arrange */}
      <ToolSection label="Arrange">
        <button
          onClick={toggleDirection}
          title={`Layout direction: ${layoutDirection} — click to cycle TB → LR → BT → RL`}
          data-testid="btn-layout-direction"
          className="toolbox-btn toolbox-btn--direction"
        >
          <span className="toolbox-btn-icon">{DIRECTION_LABEL[layoutDirection]}</span>
          <span className="toolbox-btn-label">Direction</span>
        </button>

        {/* Sort split-button: main sort + direction dropdown */}
        <div className="toolbox-split-btn" ref={sortDropdown.ref}>
          <button
            onClick={() => onSortNodes(layoutDirection)}
            title={sortTitle}
            data-testid="btn-sort-nodes"
            className="toolbox-btn toolbox-split-btn-main"
          >
            <span className="toolbox-btn-icon">⇅</span>
            <span className="toolbox-btn-label">{sortLabel}</span>
          </button>
          <button
            onClick={() => sortDropdown.setOpen(!sortDropdown.open)}
            title="Sort direction"
            data-testid="btn-sort-direction"
            className="toolbox-split-btn-toggle"
          >
            <span className="toolbox-split-btn-dir">{DIRECTION_SHORT[layoutDirection]}</span>
            <span className="toolbox-split-btn-arrow">▾</span>
          </button>
          {sortDropdown.open && (
            <div className="toolbox-dropdown" data-testid="sort-direction-dropdown">
              {ALL_DIRECTIONS.map((dir) => (
                <button
                  key={dir}
                  className={`toolbox-dropdown-item ${dir === layoutDirection ? 'toolbox-dropdown-item--active' : ''}`}
                  onClick={() => {
                    onSortNodes(dir);
                    sortDropdown.setOpen(false);
                  }}
                >
                  {DIRECTION_LABEL[dir]}
                </button>
              ))}
            </div>
          )}
        </div>

        <button onClick={() => fitView({ padding: 0.2 })} title="Fit View (F)" data-testid="btn-fit" className="toolbox-btn">
          <span className="toolbox-btn-icon">⊞</span>
          <span className="toolbox-btn-label">Fit</span>
        </button>
      </ToolSection>

      <div className="toolbox-divider" />

      {/* Export */}
      <ToolSection label="Export">
        <div className="toolbox-split-btn" ref={exportDropdown.ref}>
          <button
            onClick={onExportSvg}
            title="Save as SVG"
            data-testid="btn-save-svg"
            className="toolbox-btn toolbox-split-btn-main"
          >
            <span className="toolbox-btn-icon">↓</span>
            <span className="toolbox-btn-label">SVG</span>
          </button>
          <button
            onClick={() => exportDropdown.setOpen(!exportDropdown.open)}
            title="More export formats"
            data-testid="btn-export-more"
            className="toolbox-split-btn-toggle"
          >
            <span className="toolbox-split-btn-arrow">▾</span>
          </button>
          {exportDropdown.open && (
            <div className="toolbox-dropdown" data-testid="export-dropdown">
              <button
                className="toolbox-dropdown-item"
                data-testid="btn-save-png"
                onClick={() => { onExportPng(); exportDropdown.setOpen(false); }}
              >
                PNG
              </button>
              <button
                className="toolbox-dropdown-item"
                data-testid="btn-export-mermaid"
                onClick={() => { onExportMermaid(); exportDropdown.setOpen(false); }}
              >
                Mermaid
              </button>
            </div>
          )}
        </div>
      </ToolSection>

      <div className="toolbox-divider" />

      {/* View */}
      <ToolSection label="View">
        <button onClick={onToggleSearch} title="Search nodes (Ctrl+F)" data-testid="btn-search" className="toolbox-btn">
          <span className="toolbox-btn-icon">🔍</span>
          <span className="toolbox-btn-label">Search</span>
        </button>
        <button onClick={onToggleShortcuts} title="Keyboard shortcuts (?)" data-testid="btn-shortcuts" className="toolbox-btn">
          <span className="toolbox-btn-icon">?</span>
          <span className="toolbox-btn-label">Keys</span>
        </button>
      </ToolSection>
    </Panel>
  );
}

