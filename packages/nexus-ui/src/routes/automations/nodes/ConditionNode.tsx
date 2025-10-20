import type { ConditionActivity } from '@ansible/nexus-contracts'
import { type Node, type NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { DirectionNodeComponent } from './DirectionNode'

export type ConditionNode = { type: 'condition' } & Node<ConditionActivity>

export function ConditionNodeComponent(props: NodeProps<ConditionNode>) {
  return (
    <DirectionNodeComponent className="rounded-4xl">
      <div>
        <label className="text-lg font-bold">{props.data.name}</label>
        <div className="text-xs text-white/60">Condition</div>
      </div>
      <dl className="details">
        <dt>Condition</dt>
        <dd>{props.data.condition}</dd>
        {/* <dt className="font-mono text-xs text-white/50">JSON</dt>
        <dd className="font-mono text-sm">
          <pre>{JSON.stringify(props.data, undefined, 2)}</pre>
        </dd> */}
      </dl>
    </DirectionNodeComponent>
  )
}
