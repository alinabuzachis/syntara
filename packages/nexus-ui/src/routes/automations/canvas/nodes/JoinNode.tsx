import type { JoinActivity } from '@ansible/nexus-contracts'
import { type Node, type NodeProps } from '@xyflow/react'
import { MergeIcon } from 'lucide-react'
import { NodeBody, NodeComponent } from './common/NodeComponent'
import { NodeTitle } from './common/NodeTitle'

export type JoinNode = { type: 'join' } & Node<JoinActivity>

export function JoinNodeComponent(props: NodeProps<JoinNode>) {
  return (
    <NodeComponent className="rounded-3xl">
      <NodeTitle type="Join" name={props.data.name} icon={<MergeIcon />} />
      <NodeBody>
        <dl className="details">
          <dt>Strategy</dt>
          <dd>{props.data.join.strategy}</dd>
        </dl>
      </NodeBody>
      {/* <dl className="details"></dl> */}
    </NodeComponent>
  )
}
