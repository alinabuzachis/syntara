import type { JoinActivity } from '@ansible/nexus-contracts'
import { type Node, type NodeProps } from '@xyflow/react'

import { Detail } from '../../../../components/details/Detail'
import { Details } from '../../../../components/details/Details'

import { NodeBody } from './common/NodeBody'
import { NodeComponent } from './common/NodeComponent'
import { StandardNodeHeader } from './common/StandardNodeHeader'
import { nodeMetadata } from './nodeMetadata'

export type JoinNode = { type: 'join' } & Node<JoinActivity>

export function JoinNodeComponent(props: NodeProps<JoinNode>) {
  const metadata = nodeMetadata.join
  const Icon = metadata.icon!
  return (
    <NodeComponent className={metadata.className} nodeProps={props}>
      <StandardNodeHeader icon={<Icon />} title={props.data.name} subtitle={metadata.label} />
      <NodeBody>
        <Details>
          <Detail label="Strategy">{props.data.join.strategy}</Detail>
        </Details>
      </NodeBody>
    </NodeComponent>
  )
}
