import type { JoinActivity } from '@ansible/nexus-contracts'
import { type Node, type NodeProps } from '@xyflow/react'
import { MergeIcon } from 'lucide-react'
import { Detail } from '../../../../components/details/Detail'
import { Details } from '../../../../components/details/Details'
import { NodeBody, NodeComponent } from './common/NodeComponent'
import { NodeHeader } from './common/NodeHeader'
import { NodeIcon } from './common/NodeIcon'
import { NodeTitle } from './common/NodeTitle'

export type JoinNode = { type: 'join' } & Node<JoinActivity>

export function JoinNodeComponent(props: NodeProps<JoinNode>) {
  return (
    <NodeComponent className="rounded-3xl">
      <NodeHeader>
        <NodeIcon>
          <MergeIcon />
        </NodeIcon>
        <NodeTitle title={props.data.name} subTitle="Join" />
      </NodeHeader>
      <NodeBody>
        <Details>
          <Detail label="Strategy">{props.data.join.strategy}</Detail>
        </Details>
      </NodeBody>
    </NodeComponent>
  )
}
