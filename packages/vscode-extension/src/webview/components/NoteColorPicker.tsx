import { Panel } from '@xyflow/react';
import type { NodeColor } from '../../types/DiagramDocument';

const NOTE_COLORS: { color: NodeColor; css: string; label: string }[] = [
  { color: 'yellow', css: '#f5d837', label: 'Yellow' },
  { color: 'blue', css: '#4a90d9', label: 'Blue' },
  { color: 'green', css: '#4a9a4a', label: 'Green' },
  { color: 'red', css: '#c84040', label: 'Red' },
  { color: 'purple', css: '#8040c8', label: 'Purple' },
  { color: 'gray', css: '#888888', label: 'Gray' },
];

interface NoteColorPickerProps {
  selectedColor: NodeColor;
  onSelect: (color: NodeColor) => void;
}

export function NoteColorPicker({ selectedColor, onSelect }: NoteColorPickerProps) {
  return (
    <Panel position="top-left" className="note-color-picker" data-testid="note-color-picker">
      <span className="note-color-picker__label">Note color:</span>
      <div className="note-color-picker__swatches">
        {NOTE_COLORS.map(({ color, css, label }) => (
          <button
            key={color}
            title={label}
            aria-label={`Note color: ${label}`}
            aria-pressed={color === selectedColor}
            data-testid={`note-color-${color}`}
            className={`note-color-swatch${color === selectedColor ? ' note-color-swatch--active' : ''}`}
            style={{ background: css }}
            onClick={() => onSelect(color)}
          />
        ))}
      </div>
      <span className="note-color-picker__hint">Then click canvas to place</span>
    </Panel>
  );
}
