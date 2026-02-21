import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'diagramflow.panningHintDismissed';

/** Dismissible overlay hint explaining how to pan the canvas. */
export function PanningHint() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const dismissed = sessionStorage.getItem(STORAGE_KEY);
      if (!dismissed) {
        setVisible(true);
      }
    } catch {
      // sessionStorage unavailable in some sandbox environments.
    }
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    try {
      sessionStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // ignore
    }
  }, []);

  if (!visible) return null;

  return (
    <div className="panning-hint" data-testid="panning-hint">
      <span className="panning-hint-text">
        💡 <strong>Drag</strong> to box-select · <strong>Right-drag</strong> or <strong>scroll</strong> to pan
      </span>
      <button className="panning-hint-dismiss" onClick={dismiss} title="Dismiss">
        ✕
      </button>
    </div>
  );
}
