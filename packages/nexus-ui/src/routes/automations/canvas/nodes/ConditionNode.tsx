import type { ConditionActivity } from '@ansible/nexus-contracts'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { CodeBlock } from '../../../../components/details/CodeBlock'
import { Detail } from '../../../../components/details/Detail'
import { Details } from '../../../../components/details/Details'
import { NodeBody, NodeComponent } from './common/NodeComponent'
import { NodeHeader } from './common/NodeHeader'
import { NodeTitle } from './common/NodeTitle'
import { handleStyle } from './common/handleStyle'

export type ConditionNode = { type: 'condition' } & Node<ConditionActivity>

export function ConditionNodeComponent(props: NodeProps<ConditionNode>) {
  return (
    <NodeComponent className="rounded-4xl">
      <NodeHeader>
        {/* <NodeIcon></NodeIcon> */}
        <NodeTitle title={props.data.name} subTitle="Condition" />
      </NodeHeader>
      <NodeBody>
        <ConditionNodeDetails conditionActivity={props.data} />
      </NodeBody>
      <Handle type="source" id="then" position={Position.Right} style={{ ...handleStyle, top: '20%' }} />
      <Handle type="source" id="else" position={Position.Right} style={{ ...handleStyle, top: '80%' }} />
    </NodeComponent>
  )
}

export function ConditionNodeDetails(props: { conditionActivity: ConditionActivity }) {
  return (
    <Details>
      {props.conditionActivity.condition && (
        <Detail label="Condition">
          <CodeBlock>{props.conditionActivity.condition}</CodeBlock>
        </Detail>
      )}
      {props.conditionActivity.outputs && (
        <Detail label="Outputs">
          <CodeBlock jsonObject={props.conditionActivity.outputs} />
        </Detail>
      )}
    </Details>
  )
}
