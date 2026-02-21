import { memo } from 'react';
import { BaseEdge, getBezierPath, EdgeLabelRenderer } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import type { DiagramEdgeData } from '../lib/docToFlow';

const DASH_MAP: Record<string, string> = {
  solid: 'none',
  dashed: '8 4',
  dotted: '2 4',
};

export const DiagramEdge = memo(
  ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    label,
  }: EdgeProps & { data?: DiagramEdgeData }) => {
    const [edgePath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
    });

    const dasharray = DASH_MAP[data?.style ?? 'solid'] ?? 'none';
    const markerEnd =
      data?.arrow === 'none' ? undefined : 'url(#diagramflow-arrow)';

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
        />
        {label && (
          <EdgeLabelRenderer>
            <div
              className="edge-label"
              style={{
                position: 'absolute',
                transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                pointerEvents: 'none',
              }}
              data-testid={`edge-label-${id}`}
            >
              {label}
            </div>
          </EdgeLabelRenderer>
        )}
      </>
    );
  },
);

DiagramEdge.displayName = 'DiagramEdge';
