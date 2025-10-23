import type { LoopActivity } from '@ansible/nexus-contracts'
import { type Node, type NodeProps } from '@xyflow/react'
import { RepeatIcon } from 'lucide-react'
import { NodeComponent } from './common/NodeComponent'
import { NodeHeader } from './common/NodeHeader'
import { NodeIcon } from './common/NodeIcon'
import { NodeTitle } from './common/NodeTitle'

export type LoopNode = { type: 'loop' } & Node<LoopActivity>

export function LoopNodeComponent(props: NodeProps<LoopNode>) {
  return (
    <NodeComponent className="rounded-4xl" enableEnd enableStart>
      <NodeHeader>
        <NodeIcon>
          <RepeatIcon />
        </NodeIcon>
        <NodeTitle title={props.data.name} subTitle="Loop" />
      </NodeHeader>
    </NodeComponent>
  )
}
