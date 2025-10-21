import type { JoinActivity } from '@ansible/nexus-contracts'
import { type Node, type NodeProps } from '@xyflow/react'
import { NodeComponent } from './common/NodeComponent'
import { NodeTitle } from './common/NodeTitle'

export type JoinNode = { type: 'join' } & Node<JoinActivity>

export function JoinNodeComponent(props: NodeProps<JoinNode>) {
  return (
    <NodeComponent className="rounded-3xl">
      <NodeTitle type="Join" name={props.data.name} />
      {/* <dl className="details"></dl> */}
    </NodeComponent>
  )
}
