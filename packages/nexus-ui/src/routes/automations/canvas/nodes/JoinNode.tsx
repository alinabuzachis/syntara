import type { JoinActivity } from '@ansible/nexus-contracts'
import { type Node, type NodeProps } from '@xyflow/react'

import { Detail } from '../../../../components/details/Detail'
import { Details } from '../../../../components/details/Details'

import { NodeBody } from './common/NodeBody'
import { NodeComponent } from './common/NodeComponent'
import { StandardNodeHeader } from './common/StandardNodeHeader'
import { MenuNodeType, useNodeMenuActions } from './hooks/useNodeMenuActions'
import { nodeMetadata } from './nodeMetadata'

export type JoinNode = { type: 'join' } & Node<JoinActivity>

export function JoinNodeComponent(props: NodeProps<JoinNode>) {
  const metadata = nodeMetadata.join
  const Icon = metadata.icon!
  const strategy = props.data.join?.strategy ?? 'all'
  const count =
    props.data.join?.strategy === 'count' && props.data.join && 'count' in props.data.join
      ? props.data.join.count
      : undefined

  const menuActions = useNodeMenuActions({
    nodeId: props.data.id,
    nodeType: MenuNodeType.ACTIVITY,
  })

  return (
    <NodeComponent className={metadata.className} nodeProps={props}>
      <StandardNodeHeader
        icon={<Icon />}
        title={props.data.name}
        subtitle={metadata.label}
        expandable
        menuActions={menuActions}
      />
      <div className="justify-left flex overflow-hidden">
        <NodeBody>
          <Details>
            <Detail label="Strategy">{strategy}</Detail>
            {count !== undefined && <Detail label="Count">{count}</Detail>}
          </Details>
        </NodeBody>
      </div>
    </NodeComponent>
  )
}
