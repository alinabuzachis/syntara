import type { ParallelActivity } from '@ansible/nexus-contracts'
import { type Node, type NodeProps } from '@xyflow/react'

import { NodeComponent } from './common/NodeComponent'
import { StandardNodeHeader } from './common/StandardNodeHeader'
import { nodeMetadata } from './nodeMetadata'

export type ParallelNode = { type: 'parallel' } & Node<ParallelActivity>

export function ParallelNodeComponent(props: NodeProps<ParallelNode>) {
  const metadata = nodeMetadata.parallel
  return (
    <NodeComponent className={metadata.className} nodeProps={props}>
      <StandardNodeHeader title={props.data.name} subtitle={metadata.label} />
    </NodeComponent>
  )
}
