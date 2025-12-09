import type { LoopActivity } from '@ansible/nexus-contracts'
import { type Node, type NodeProps } from '@xyflow/react'

import { BranchHandle, BranchHandles } from './common/BranchHandle'
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
        <BranchHandles>
          <BranchHandle id="done">Done</BranchHandle>
          <BranchHandle id="loop">Loop</BranchHandle>
        </BranchHandles>
      </div>
    </NodeComponent>
  )
}
