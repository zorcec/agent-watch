import { memo, useState, useCallback } from 'react';
import { Handle, Position, NodeToolbar } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { DiagramNodeData } from '../lib/docToFlow';

type DiagramNodeProps = NodeProps & {
  data: DiagramNodeData & {
    onLabelChange?: (id: string, label: string) => void;
    onUnpin?: (id: string) => void;
  };
};

export const DiagramNode = memo(({ id, data, selected }: DiagramNodeProps) => {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(data.label);

  const commitEdit = useCallback(() => {
    setEditing(false);
    if (editValue.trim() && editValue.trim() !== data.label) {
      data.onLabelChange?.(id, editValue.trim());
    }
  }, [id, editValue, data]);

  const startEdit = useCallback(() => {
    setEditValue(data.label);
    setEditing(true);
  }, [data.label]);

  const isNote = data.shape === 'note';
  const shapeClass = `diagram-node shape-${data.shape} color-${data.color}`;

  return (
    <>
      {!isNote && (
        <>
          <Handle type="target" position={Position.Top} id="top" />
          <Handle type="target" position={Position.Left} id="left" />
          <Handle type="source" position={Position.Bottom} id="bottom" />
          <Handle type="source" position={Position.Right} id="right" />
        </>
      )}

      <div
        className={shapeClass}
        style={{ width: data.width, height: data.height }}
        onDoubleClick={startEdit}
        data-testid={`node-${id}`}
      >
        {data.pinned && <span className="pin-indicator">📌</span>}

        {editing ? (
          <input
            className="node-label-input"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEdit();
              if (e.key === 'Escape') setEditing(false);
            }}
            autoFocus
            data-testid={`node-input-${id}`}
          />
        ) : (
          <span className="node-label">{data.label}</span>
        )}
      </div>

      <NodeToolbar isVisible={selected} position={Position.Top}>
        <div className="node-toolbar-actions">
          <button
            className="toolbar-action-btn"
            onClick={startEdit}
            title="Edit label"
          >
            ✏️
          </button>
          {data.pinned && (
            <button
              className="toolbar-action-btn"
              onClick={() => data.onUnpin?.(id)}
              title="Unpin node (allow auto-layout to reposition)"
            >
              📍
            </button>
          )}
        </div>
      </NodeToolbar>
    </>
  );
});

DiagramNode.displayName = 'DiagramNode';
