import type { JoinActivity } from '@ansible/nexus-contracts'
import { type Node, type NodeProps } from '@xyflow/react'
import { DirectionNodeComponent } from './DirectionNode'

export type JoinNode = { type: 'join' } & Node<JoinActivity>

export function JoinNodeComponent(props: NodeProps<JoinNode>) {
  return (
    <DirectionNodeComponent className="rounded-3xl">
      <div>
        <label className="text-lg font-bold">{props.data.name}</label>
        <div className="text-xs text-white/60">Join</div>
      </div>
      <dl className="details"></dl>
    </DirectionNodeComponent>
  )
}
