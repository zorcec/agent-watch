import { useCallback, useEffect, useRef, useState } from 'react';
import { Panel } from '@xyflow/react';

interface ImageInputPanelProps {
  onConfirm: (src: string, description?: string) => void;
  onCancel: () => void;
}

export function ImageInputPanel({ onConfirm, onCancel }: ImageInputPanelProps) {
  const [src, setSrc] = useState('');
  const [description, setDescription] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = src.trim();
      if (!trimmed) return;
      onConfirm(trimmed, description.trim() || undefined);
    },
    [src, description, onConfirm],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    },
    [onCancel],
  );

  return (
    <Panel position="top-left" className="image-input-panel" data-testid="image-input-panel">
      <div className="image-input-panel__header">
        <span className="image-input-panel__title">Place Image</span>
        <button
          className="image-input-panel__close"
          onClick={onCancel}
          title="Cancel (Escape)"
          aria-label="Cancel image placement"
        >
          ✕
        </button>
      </div>
      <form onSubmit={handleSubmit} className="image-input-panel__form">
        <label className="image-input-panel__field">
          <span>Image URL</span>
          <input
            ref={inputRef}
            type="text"
            value={src}
            placeholder="https://example.com/image.png"
            onChange={(e) => setSrc(e.target.value)}
            onKeyDown={handleKeyDown}
            data-testid="image-url-input"
            className="image-input-panel__input"
          />
        </label>
        <label className="image-input-panel__field">
          <span>Description (optional)</span>
          <input
            type="text"
            value={description}
            placeholder="Alt text / caption"
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={handleKeyDown}
            data-testid="image-description-input"
            className="image-input-panel__input"
          />
        </label>
        <div className="image-input-panel__actions">
          <button
            type="submit"
            disabled={!src.trim()}
            className="image-input-panel__btn image-input-panel__btn--primary"
            data-testid="image-place-btn"
          >
            Place on canvas ↗
          </button>
          <button
            type="button"
            className="image-input-panel__btn"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </form>
    </Panel>
  );
}
