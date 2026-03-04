import { memo, useState, useCallback } from 'react';
import { BaseEdge, getSmoothStepPath, EdgeLabelRenderer, Position, useInternalNode } from '@xyflow/react';
import type { EdgeProps, InternalNode } from '@xyflow/react';
import type { DiagramEdgeData } from '../lib/docToFlow';

const DASH_MAP: Record<string, string> = {
  solid: 'none',
  dashed: '8 4',
  dotted: '2 4',
};

/**
 * Computes which face of each node is closest to the other node, then returns
 * the absolute XY coordinate of that face's midpoint and the ReactFlow Position
 * enum for both source and target. This makes edges automatically re-route to the
 * most direct side whenever a node is dragged — no fixed handle IDs needed.
 */
function computeFloatingHandles(
  sourceNode: InternalNode | undefined,
  targetNode: InternalNode | undefined,
): {
  sourceX: number; sourceY: number; sourcePosition: Position;
  targetX: number; targetY: number; targetPosition: Position;
} | null {
  if (!sourceNode?.internals?.positionAbsolute || !targetNode?.internals?.positionAbsolute) {
    return null;
  }

  const sw = sourceNode.measured?.width ?? 160;
  const sh = sourceNode.measured?.height ?? 48;
  const tw = targetNode.measured?.width ?? 160;
  const th = targetNode.measured?.height ?? 48;

  const sx = sourceNode.internals.positionAbsolute.x;
  const sy = sourceNode.internals.positionAbsolute.y;
  const tx = targetNode.internals.positionAbsolute.x;
  const ty = targetNode.internals.positionAbsolute.y;

  // Vector between node centers
  const dx = (tx + tw / 2) - (sx + sw / 2);
  const dy = (ty + th / 2) - (sy + sh / 2);

  // Source exit: dominant axis determines which face to exit from
  let sourcePosition: Position;
  let sourceX: number;
  let sourceY: number;
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= 0) {
      sourcePosition = Position.Right; sourceX = sx + sw; sourceY = sy + sh / 2;
    } else {
      sourcePosition = Position.Left; sourceX = sx; sourceY = sy + sh / 2;
    }
  } else {
    if (dy >= 0) {
      sourcePosition = Position.Bottom; sourceX = sx + sw / 2; sourceY = sy + sh;
    } else {
      sourcePosition = Position.Top; sourceX = sx + sw / 2; sourceY = sy;
    }
  }

  // Target entry: opposite face to the source exit direction
  let targetPosition: Position;
  let targetX: number;
  let targetY: number;
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= 0) {
      targetPosition = Position.Left; targetX = tx; targetY = ty + th / 2;
    } else {
      targetPosition = Position.Right; targetX = tx + tw; targetY = ty + th / 2;
    }
  } else {
    if (dy >= 0) {
      targetPosition = Position.Top; targetX = tx + tw / 2; targetY = ty;
    } else {
      targetPosition = Position.Bottom; targetX = tx + tw / 2; targetY = ty + th;
    }
  }

  return { sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition };
}

export const DiagramEdge = memo(
  ({
    id,
    source,
    target,
    sourceX: defaultSourceX,
    sourceY: defaultSourceY,
    targetX: defaultTargetX,
    targetY: defaultTargetY,
    sourcePosition: defaultSourcePosition,
    targetPosition: defaultTargetPosition,
    data,
    label,
  }: EdgeProps & { data?: DiagramEdgeData }) => {
    const sourceNode = useInternalNode(source);
    const targetNode = useInternalNode(target);

    // Inline label editing state — Miro-style double-click on edge to add/edit label.
    const [editingLabel, setEditingLabel] = useState(false);
    const [labelDraft, setLabelDraft] = useState('');

    const startLabelEdit = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        setLabelDraft(typeof label === 'string' ? label : '');
        setEditingLabel(true);
      },
      [label],
    );

    const commitLabel = useCallback(() => {
      setEditingLabel(false);
      const next = labelDraft.trim();
      // Only dispatch if the label actually changed.
      if (next !== (typeof label === 'string' ? label : '')) {
        data?.onLabelChange?.(id, next);
      }
    }, [labelDraft, label, data, id]);

    const handleInputKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitLabel();
        }
        if (e.key === 'Escape') {
          setEditingLabel(false);
        }
      },
      [commitLabel],
    );

    // Prefer dynamically computed floating handles; fall back to ReactFlow defaults
    const floating = computeFloatingHandles(sourceNode, targetNode);

    const [edgePath, labelX, labelY] = getSmoothStepPath({
      sourceX: floating?.sourceX ?? defaultSourceX,
      sourceY: floating?.sourceY ?? defaultSourceY,
      targetX: floating?.targetX ?? defaultTargetX,
      targetY: floating?.targetY ?? defaultTargetY,
      sourcePosition: floating?.sourcePosition ?? defaultSourcePosition,
      targetPosition: floating?.targetPosition ?? defaultTargetPosition,
      borderRadius: 8,
    });

    const dasharray = DASH_MAP[data?.style ?? 'solid'] ?? 'none';
    const hasArrow = data?.arrow !== 'none';
    const isBidirectional = data?.bidirectional === true;

    const markerEnd = hasArrow ? 'url(#diagramflow-arrow)' : undefined;
    const markerStart = (hasArrow && isBidirectional) ? 'url(#diagramflow-arrow-start)' : undefined;

    const showLabel = !!(label || editingLabel);

    return (
      <>
        <BaseEdge
          id={id}
          path={edgePath}
          style={{
            strokeDasharray: dasharray === 'none' ? undefined : dasharray,
            stroke: 'var(--rf-edge, #888)',
            strokeWidth: 2,
          }}
          markerEnd={markerEnd}
          markerStart={markerStart}
        />

        {/* Invisible wide hit area — Miro behavior: double-click anywhere on edge to edit label. */}
        <path
          d={edgePath}
          fill="none"
          strokeWidth={16}
          stroke="transparent"
          className="react-flow__edge-interaction"
          style={{ cursor: 'pointer' }}
          onDoubleClick={startLabelEdit}
        />

        {showLabel && (
          <EdgeLabelRenderer>
            <div
              className="edge-label nodrag nopan"
              style={{
                position: 'absolute',
                transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                zIndex: 10,
                pointerEvents: editingLabel ? 'all' : 'none',
              }}
              data-testid={`edge-label-${id}`}
              onDoubleClick={startLabelEdit}
            >
              {editingLabel ? (
                <input
                  className="edge-label-input"
                  value={labelDraft}
                  autoFocus
                  placeholder="Edge label…"
                  onChange={(e) => setLabelDraft(e.target.value)}
                  onBlur={commitLabel}
                  onKeyDown={handleInputKeyDown}
                  data-testid={`edge-label-input-${id}`}
                />
              ) : (
                <span>{label}</span>
              )}
            </div>
          </EdgeLabelRenderer>
        )}
      </>
    );
  },
);

DiagramEdge.displayName = 'DiagramEdge';

