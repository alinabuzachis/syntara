import type { ParallelActivity } from '@ansible/nexus-contracts'
import { type Node, type NodeProps } from '@xyflow/react'
import { NodeComponent } from './common/NodeComponent'
import { NodeTitle } from './common/NodeTitle'

export type ParallelNode = { type: 'parallel' } & Node<ParallelActivity>

export function ParallelNodeComponent(props: NodeProps<ParallelNode>) {
  return (
    <NodeComponent className="rounded-4xl">
      <NodeTitle type="Parallel" name={props.data.name} />
    </NodeComponent>
  )
}
