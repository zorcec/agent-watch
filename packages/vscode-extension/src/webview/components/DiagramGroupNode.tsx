import { memo } from 'react';
import { NodeResizer } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { DiagramGroupNodeData } from '../lib/docToFlow';

type DiagramGroupNodeProps = NodeProps & {
  data: DiagramGroupNodeData & {
    onToggleCollapse?: (id: string) => void;
  };
};

export const DiagramGroupNode = memo(({ id, data, selected }: DiagramGroupNodeProps) => {
  const colorClass = data.color && data.color !== 'default' ? `group-color--${data.color}` : '';
  const collapsedClass = data.collapsed ? ' diagram-group--collapsed' : '';

  return (
    <>
      {!data.collapsed && (
        <NodeResizer isVisible={selected} minWidth={80} minHeight={40} />
      )}
      <div
        className={`diagram-group ${colorClass}${selected ? ' diagram-group--selected' : ''}${collapsedClass}`}
        onDoubleClick={() => data.onToggleCollapse?.(id)}
        title={data.collapsed ? 'Double-click to expand group' : 'Double-click to collapse group'}
        data-testid="diagram-group-node"
      >
        <span className="diagram-group-label">
          {data.collapsed ? '▶ ' : '▼ '}
          {data.label}
        </span>
      </div>
    </>
  );
});

DiagramGroupNode.displayName = 'DiagramGroupNode';
