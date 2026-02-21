import { useCallback, useEffect, useState } from 'react';
import type { Node, Edge } from '@xyflow/react';
import type { DiagramNodeData } from '../lib/docToFlow';
import type { DiagramGroup, NodeShape, NodeColor, EdgeStyle, ArrowType } from '../../types/DiagramDocument';
import { NODE_SHAPES, NODE_COLORS, EDGE_STYLES, ARROW_TYPES } from '../../types/DiagramDocument';

type NodeProps = {
  kind: 'node';
  node: Node<DiagramNodeData>;
  groups: DiagramGroup[];
  onUpdateNode: (
    id: string,
    changes: { label?: string; shape?: NodeShape; color?: NodeColor; notes?: string; group?: string | null; pinned?: boolean },
  ) => void;
};

type EdgeProps = {
  kind: 'edge';
  edge: Edge;
  onUpdateEdge: (id: string, changes: { label?: string; style?: EdgeStyle; arrow?: ArrowType; animated?: boolean }) => void;
};

type GroupProps = {
  kind: 'group';
  group: DiagramGroup;
  onUpdateGroup: (id: string, changes: { label?: string; color?: NodeColor }) => void;
};

type EmptyProps = { kind: 'none' };

export type PropertiesPanelInput = NodeProps | EdgeProps | GroupProps | EmptyProps;

const SHAPE_LABELS: Record<NodeShape, string> = {
  rectangle: 'Rectangle',
  rounded: 'Rounded',
  diamond: 'Diamond',
  cylinder: 'Cylinder',
  note: 'Note',
};

const COLOR_LABELS: Record<NodeColor, string> = {
  default: 'Default',
  blue: 'Blue',
  green: 'Green',
  red: 'Red',
  yellow: 'Yellow',
  purple: 'Purple',
  gray: 'Gray',
};

const STYLE_LABELS: Record<EdgeStyle, string> = {
  solid: 'Solid',
  dashed: 'Dashed',
  dotted: 'Dotted',
};

const ARROW_LABELS: Record<ArrowType, string> = {
  normal: 'Arrow',
  arrow: 'Arrow (alt)',
  open: 'Open',
  none: 'None',
};

export function PropertiesPanel(props: PropertiesPanelInput) {
  if (props.kind === 'none') {
    return (
      <aside className="properties-panel properties-panel--empty" data-testid="properties-panel">
        <p className="properties-panel__hint">Select a node or edge to edit its properties.</p>
      </aside>
    );
  }

  if (props.kind === 'node') {
    return <NodePropertiesPanel {...props} />;
  }

  if (props.kind === 'group') {
    return <GroupPropertiesPanel {...props} />;
  }

  return <EdgePropertiesPanel {...props} />;
}

// ---------------------------------------------------------------------------
// Node Properties
// ---------------------------------------------------------------------------

function NodePropertiesPanel({ node, groups, onUpdateNode }: NodeProps) {
  const [label, setLabel] = useState(node.data.label);
  const [notes, setNotes] = useState(node.data.notes ?? '');

  // Sync when a different node is selected.
  useEffect(() => {
    setLabel(node.data.label);
    setNotes(node.data.notes ?? '');
  }, [node.id, node.data.label, node.data.notes]);

  const commitLabel = useCallback(() => {
    const trimmed = label.trim();
    if (trimmed && trimmed !== node.data.label) {
      onUpdateNode(node.id, { label: trimmed });
    }
  }, [node.id, node.data.label, label, onUpdateNode]);

  const commitNotes = useCallback(() => {
    if (notes !== (node.data.notes ?? '')) {
      onUpdateNode(node.id, { notes: notes.trim() || undefined });
    }
  }, [node.id, node.data.notes, notes, onUpdateNode]);

  const currentGroup = (node as any).parentId ?? null;

  const handleGroupChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      onUpdateNode(node.id, { group: value === '' ? null : value });
    },
    [node.id, onUpdateNode],
  );

  return (
    <aside className="properties-panel" data-testid="properties-panel">
      <h3 className="properties-panel__title">Node Properties</h3>

      <div className="prop-group">
        <label className="prop-label" htmlFor="prop-label">Label</label>
        <input
          id="prop-label"
          className="prop-input"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={commitLabel}
          onKeyDown={(e) => { if (e.key === 'Enter') commitLabel(); }}
          data-testid="prop-node-label"
        />
      </div>

      <div className="prop-group">
        <span className="prop-label">Shape</span>
        <div className="prop-radio-group" data-testid="prop-node-shape">
          {NODE_SHAPES.map((s) => (
            <button
              key={s}
              className={`prop-chip${node.data.shape === s ? ' prop-chip--active' : ''}`}
              onClick={() => onUpdateNode(node.id, { shape: s })}
              title={SHAPE_LABELS[s]}
              data-testid={`prop-shape-${s}`}
            >
              {SHAPE_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="prop-group">
        <span className="prop-label">Color</span>
        <div className="prop-color-grid" data-testid="prop-node-color">
          {NODE_COLORS.map((c) => (
            <button
              key={c}
              className={`prop-color-swatch color-swatch--${c}${node.data.color === c ? ' prop-color-swatch--active' : ''}`}
              onClick={() => onUpdateNode(node.id, { color: c })}
              title={COLOR_LABELS[c]}
              data-testid={`prop-color-${c}`}
              aria-label={COLOR_LABELS[c]}
            />
          ))}
        </div>
      </div>

      {groups.length > 0 && (
        <div className="prop-group">
          <label className="prop-label" htmlFor="prop-node-group">Group</label>
          <select
            id="prop-node-group"
            className="prop-select"
            value={currentGroup ?? ''}
            onChange={handleGroupChange}
            data-testid="prop-node-group"
          >
            <option value="">(none)</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="prop-group">
        <label className="prop-label" htmlFor="prop-notes">Notes</label>
        <textarea
          id="prop-notes"
          className="prop-textarea"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={commitNotes}
          rows={4}
          placeholder="Optional notes for this node…"
          data-testid="prop-node-notes"
        />
      </div>

      <div className="prop-group prop-group--row">
        <label className="prop-label" htmlFor="prop-node-pinned">Pinned (lock position)</label>
        <input
          id="prop-node-pinned"
          type="checkbox"
          className="prop-checkbox"
          checked={node.data.pinned ?? false}
          onChange={(e) => onUpdateNode(node.id, { pinned: e.target.checked })}
          title="When pinned, auto-layout won't move this node"
          data-testid="prop-node-pinned"
        />
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Group Properties
// ---------------------------------------------------------------------------

function GroupPropertiesPanel({ group, onUpdateGroup }: GroupProps) {
  const [label, setLabel] = useState(group.label);

  useEffect(() => {
    setLabel(group.label);
  }, [group.id, group.label]);

  const commitLabel = useCallback(() => {
    const trimmed = label.trim();
    if (trimmed && trimmed !== group.label) {
      onUpdateGroup(group.id, { label: trimmed });
    }
  }, [group.id, group.label, label, onUpdateGroup]);

  return (
    <aside className="properties-panel" data-testid="properties-panel">
      <h3 className="properties-panel__title">Group Properties</h3>

      <div className="prop-group">
        <label className="prop-label" htmlFor="prop-group-label">Label</label>
        <input
          id="prop-group-label"
          className="prop-input"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={commitLabel}
          onKeyDown={(e) => { if (e.key === 'Enter') commitLabel(); }}
          data-testid="prop-group-label"
        />
      </div>

      <div className="prop-group">
        <span className="prop-label">Color</span>
        <div className="prop-color-grid" data-testid="prop-group-color">
          {NODE_COLORS.map((c) => (
            <button
              key={c}
              className={`prop-color-swatch color-swatch--${c}${(group.color ?? 'default') === c ? ' prop-color-swatch--active' : ''}`}
              onClick={() => onUpdateGroup(group.id, { color: c })}
              title={COLOR_LABELS[c]}
              data-testid={`prop-group-color-${c}`}
              aria-label={COLOR_LABELS[c]}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Edge Properties
// ---------------------------------------------------------------------------

function EdgePropertiesPanel({ edge, onUpdateEdge }: EdgeProps) {
  const data = edge.data as { style?: EdgeStyle; arrow?: ArrowType } | undefined;
  const [label, setLabel] = useState(String(edge.label ?? ''));
  const [animated, setAnimated] = useState(edge.animated ?? false);

  useEffect(() => {
    setLabel(String(edge.label ?? ''));
    setAnimated(edge.animated ?? false);
  }, [edge.id, edge.label, edge.animated]);

  const commitLabel = useCallback(() => {
    const trimmed = label.trim();
    if (trimmed !== String(edge.label ?? '').trim()) {
      onUpdateEdge(edge.id, { label: trimmed || undefined });
    }
  }, [edge.id, edge.label, label, onUpdateEdge]);

  const toggleAnimated = useCallback(() => {
    const next = !animated;
    setAnimated(next);
    onUpdateEdge(edge.id, { animated: next });
  }, [edge.id, animated, onUpdateEdge]);

  return (
    <aside className="properties-panel" data-testid="properties-panel">
      <h3 className="properties-panel__title">Edge Properties</h3>

      <div className="prop-group">
        <label className="prop-label" htmlFor="prop-edge-label">Label</label>
        <input
          id="prop-edge-label"
          className="prop-input"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={commitLabel}
          onKeyDown={(e) => { if (e.key === 'Enter') commitLabel(); }}
          data-testid="prop-edge-label"
        />
      </div>

      <div className="prop-group">
        <span className="prop-label">Line Style</span>
        <div className="prop-radio-group" data-testid="prop-edge-style">
          {EDGE_STYLES.map((s) => (
            <button
              key={s}
              className={`prop-chip${data?.style === s ? ' prop-chip--active' : ''}`}
              onClick={() => onUpdateEdge(edge.id, { style: s })}
              data-testid={`prop-style-${s}`}
            >
              {STYLE_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="prop-group">
        <span className="prop-label">Arrow</span>
        <div className="prop-radio-group" data-testid="prop-edge-arrow">
          {ARROW_TYPES.map((a) => (
            <button
              key={a}
              className={`prop-chip${data?.arrow === a ? ' prop-chip--active' : ''}`}
              onClick={() => onUpdateEdge(edge.id, { arrow: a })}
              data-testid={`prop-arrow-${a}`}
            >
              {ARROW_LABELS[a]}
            </button>
          ))}
        </div>
      </div>

      <div className="prop-group prop-group--row">
        <label className="prop-label" htmlFor="prop-edge-animated">Animated</label>
        <input
          id="prop-edge-animated"
          type="checkbox"
          className="prop-checkbox"
          checked={animated}
          onChange={toggleAnimated}
          data-testid="prop-edge-animated"
        />
      </div>
    </aside>
  );
}
