import { useCallback } from 'react';

type ShortcutsPanelProps = {
  onClose: () => void;
};

const SHORTCUTS = [
  { keys: 'N', description: 'Add a new node' },
  { keys: 'G', description: 'Add a new group' },
  { keys: 'L', description: 'Auto layout (respects pinned nodes)' },
  { keys: 'Shift+L', description: 'Force layout (repositions all nodes)' },
  { keys: 'F', description: 'Fit view to diagram' },
  { keys: 'Ctrl+F', description: 'Search nodes' },
  { keys: 'Ctrl+Z', description: 'Undo' },
  { keys: 'Ctrl+Shift+Z / Ctrl+Y', description: 'Redo' },
  { keys: 'Ctrl+C', description: 'Copy selected nodes' },
  { keys: 'Ctrl+V', description: 'Paste copied nodes' },
  { keys: 'Delete / Backspace', description: 'Delete selected element' },
  { keys: 'Esc', description: 'Close search / deselect' },
] as const;

const MOUSE_SHORTCUTS = [
  { action: 'Drag on canvas', description: 'Box-select multiple nodes' },
  { action: 'Right-drag / Scroll', description: 'Pan the canvas' },
  { action: 'Shift+Click', description: 'Add to selection' },
  { action: 'Double-click group', description: 'Collapse / expand group' },
  { action: 'Double-click node', description: 'Edit node label inline' },
  { action: 'Drag edge endpoint', description: 'Reconnect edge to different node' },
  { action: 'Click 📍 on node', description: 'Unpin node (allow auto-layout)' },
] as const;

export function ShortcutsPanel({ onClose }: ShortcutsPanelProps) {
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  return (
    <div
      className="shortcuts-overlay"
      onClick={handleBackdropClick}
      data-testid="shortcuts-panel"
    >
      <div className="shortcuts-dialog">
        <div className="shortcuts-header">
          <h3>Keyboard &amp; Mouse Shortcuts</h3>
          <button className="shortcuts-close-btn" onClick={onClose} title="Close">
            ✕
          </button>
        </div>

        <div className="shortcuts-content">
          <section>
            <h4>Keyboard</h4>
            <table className="shortcuts-table">
              <tbody>
                {SHORTCUTS.map(({ keys, description }) => (
                  <tr key={keys}>
                    <td>
                      <kbd className="kbd">{keys}</kbd>
                    </td>
                    <td>{description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <h4>Mouse</h4>
            <table className="shortcuts-table">
              <tbody>
                {MOUSE_SHORTCUTS.map(({ action, description }) => (
                  <tr key={action}>
                    <td>
                      <span className="kbd">{action}</span>
                    </td>
                    <td>{description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  );
}
