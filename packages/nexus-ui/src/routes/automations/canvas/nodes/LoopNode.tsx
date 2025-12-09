import type { LoopActivity } from '@ansible/nexus-contracts'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'

import { handleStyle } from './common/handleStyle'
import { NodeComponent } from './common/NodeComponent'
import { StandardNodeHeader } from './common/StandardNodeHeader'
import { MenuNodeType, useNodeMenuActions } from './hooks/useNodeMenuActions'
import { nodeMetadata } from './nodeMetadata'

export type LoopNode = { type: 'loop' } & Node<LoopActivity>

export function LoopNodeComponent(props: NodeProps<LoopNode>) {
  const metadata = nodeMetadata.loop
  const Icon = metadata.icon!
  const menuActions = useNodeMenuActions({
    nodeId: props.data.id,
    nodeType: MenuNodeType.ACTIVITY,
  })

  return (
    <NodeComponent
      className={metadata.className}
      enableEnd={metadata.enableEnd}
      enableStart={metadata.enableStart}
      nodeProps={props}
    >
      <StandardNodeHeader
        icon={<Icon />}
        title={props.data.name ?? ''}
        subtitle={metadata.label}
        menuActions={menuActions}
      />
      <div className="flex justify-end">
        <LoopNodeHandles>
          <LoopNodeHandle id="done">Done</LoopNodeHandle>
          <LoopNodeHandle id="loop">Loop</LoopNodeHandle>
        </LoopNodeHandles>
      </div>
    </NodeComponent>
  )
}

function LoopNodeHandles(props: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-2 self-end pb-2">{props.children}</div>
}

function LoopNodeHandle(props: { children: React.ReactNode; id: string }) {
  return (
    <div className="group/handle relative rounded-l-4xl border-y-2 border-l-2 border-white/20 bg-white/10 px-3 py-1 hover:border-white/40 hover:bg-white/20">
      {props.children}
      <Handle
        type="source"
        id={props.id}
        position={Position.Right}
        style={{
          ...handleStyle,
          // Cover the entire label area to ensure ReactFlow detects the correct handle
          width: '100%',
          height: '100%',
          top: 15,
          right: 0,
          borderRadius: '0',
          opacity: 1,
        }}
      />
      {/* Visual indicator half-circle - only visible when parent has handle-{id}-connected class */}
      <div
        className={`handle-${props.id}-indicator pointer-events-none absolute top-1/2 right-0 -translate-y-1/2 opacity-0`}
        style={{
          width: '8px',
          height: '16px',
          borderRadius: '8px 0 0 8px',
          border: '2px solid #6b7280',
          borderRight: 'none',
          background: 'white',
        }}
      />
    </div>
  )
}
