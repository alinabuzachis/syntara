import type { ConditionActivity } from '@ansible/nexus-contracts'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'

import { Details } from '../../../../components/details/Details'

import { renderCondition, renderOutputs, renderJson } from './common/detailRenderers'
import { handleStyle } from './common/handleStyle'
import { NodeBody } from './common/NodeBody'
import { NodeComponent } from './common/NodeComponent'
import { NodeExpandedContext } from './common/NodeExpandedContext'
import { StandardNodeHeader } from './common/StandardNodeHeader'
import { nodeMetadata } from './nodeMetadata'

export type ConditionNode = { type: 'condition' } & Node<ConditionActivity>

export function ConditionNodeComponent(props: NodeProps<ConditionNode>) {
  const metadata = nodeMetadata.condition
  const Icon = metadata.icon!
  return (
    <NodeComponent className={metadata.className} nodeProps={props}>
      <NodeExpandedContext.Provider value={null}>
        <ConditionNodeDetails conditionActivity={props.data} icon={<Icon />}>
          <NodeHandles>
            <NodeHandle id="then">then</NodeHandle>
            {props.data.else && props.data.else.length > 0 && <NodeHandle id="else">else</NodeHandle>}
          </NodeHandles>
        </ConditionNodeDetails>
      </NodeExpandedContext.Provider>
    </NodeComponent>
  )
}

export function ConditionNodeDetails(props: {
  conditionActivity: ConditionActivity
  children?: React.ReactNode
  showJson?: boolean
  icon?: React.ReactNode
}) {
  const metadata = nodeMetadata.condition
  return (
    <>
      <StandardNodeHeader icon={props.icon} title={props.conditionActivity.name} subtitle={metadata.label} expandable />
      <div className="flex justify-end overflow-hidden">
        <NodeBody>
          <Details>
            {renderCondition(props.conditionActivity.condition)}
            {renderOutputs(props.conditionActivity.outputs)}
            {renderJson(props.conditionActivity, props.showJson, 'Full Definition')}
          </Details>
        </NodeBody>
        {props.children}
      </div>
    </>
  )
}

function NodeHandles(props: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-2 self-end pb-2">{props.children}</div>
}

function NodeHandle(props: { children: React.ReactNode; id: string }) {
  return (
    <div className="relative rounded-l-4xl border-y-2 border-l-2 border-white/20 bg-white/10 px-4 py-2">
      {props.children}
      <Handle type="source" id={props.id} position={Position.Right} style={handleStyle} />
    </div>
  )
}
