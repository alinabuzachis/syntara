import type { ConditionActivity } from '@ansible/nexus-contracts'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { SplitIcon } from 'lucide-react'
import { CodeBlock } from '../../../../components/details/CodeBlock'
import { Detail } from '../../../../components/details/Detail'
import { Details } from '../../../../components/details/Details'
import { NodeBody } from './common/NodeBody'
import { NodeComponent } from './common/NodeComponent'
import { NodeHeader } from './common/NodeHeader'
import { NodeIcon } from './common/NodeIcon'
import { NodeTitle } from './common/NodeTitle'
import { handleStyle } from './common/handleStyle'

export type ConditionNode = { type: 'condition' } & Node<ConditionActivity>

export function ConditionNodeComponent(props: NodeProps<ConditionNode>) {
  return (
    <NodeComponent className="rounded-4xl">
      <NodeHeader>
        <NodeIcon>
          <SplitIcon />
        </NodeIcon>
        <NodeTitle title={props.data.name} subTitle="Condition" />
      </NodeHeader>
      <NodeBody>
        <ConditionNodeDetails conditionActivity={props.data} />
      </NodeBody>
      <NodeHandles>
        <NodeHandle id="then">then</NodeHandle>
        <NodeHandle id="else">else</NodeHandle>
      </NodeHandles>
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

function NodeHandles(props: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-1 self-end pb-2">{props.children}</div>
}

function NodeHandle(props: { children: React.ReactNode; id: string }) {
  return (
    <div className="relative rounded-l-4xl border-y-2 border-l-2 border-white/20 bg-white/10 px-4 py-2">
      {props.children}
      <Handle type="source" id={props.id} position={Position.Right} style={handleStyle} />
    </div>
  )
}
