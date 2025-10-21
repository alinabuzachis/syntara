import type { ConditionActivity } from '@ansible/nexus-contracts'
import { type Node, type NodeProps } from '@xyflow/react'
import { NodeComponent } from './common/NodeComponent'
import { NodeTitle } from './common/NodeTitle'

export type ConditionNode = { type: 'condition' } & Node<ConditionActivity>

export function ConditionNodeComponent(props: NodeProps<ConditionNode>) {
  return (
    <NodeComponent className="rounded-4xl">
      <NodeTitle type="Condition" name={props.data.name} />
      <dl className="details">
        <dt>Condition</dt>
        <dd>{props.data.condition}</dd>
        {/* <dt className="font-mono text-xs text-white/50">JSON</dt>
        <dd className="font-mono text-sm">
          <pre>{JSON.stringify(props.data, undefined, 2)}</pre>
        </dd> */}
      </dl>
    </NodeComponent>
  )
}
