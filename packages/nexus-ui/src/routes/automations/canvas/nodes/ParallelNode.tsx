import type { ParallelActivity } from '@ansible/nexus-contracts'
import { type Node, type NodeProps } from '@xyflow/react'
import { NodeComponent } from './common/NodeComponent'
import { NodeHeader } from './common/NodeHeader'
import { NodeTitle } from './common/NodeTitle'

export type ParallelNode = { type: 'parallel' } & Node<ParallelActivity>

export function ParallelNodeComponent(props: NodeProps<ParallelNode>) {
  return (
    <NodeComponent className="rounded-4xl">
      <NodeHeader>
        <NodeTitle title={props.data.name} subTitle="Parallel" />
      </NodeHeader>
    </NodeComponent>
  )
}
