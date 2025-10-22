import type { LoopActivity } from '@ansible/nexus-contracts'
import { type Node, type NodeProps } from '@xyflow/react'
import { RepeatIcon } from 'lucide-react'
import { NodeComponent } from './common/NodeComponent'
import { NodeTitle } from './common/NodeTitle'

export type LoopNode = { type: 'loop' } & Node<LoopActivity>

export function LoopNodeComponent(props: NodeProps<LoopNode>) {
  return (
    <NodeComponent className="rounded-4xl" enableEnd enableStart>
      <NodeTitle type="Loop" name={props.data.name} icon={<RepeatIcon className="scale-x-[-1]" />} />
    </NodeComponent>
  )
}
