import type { ConditionActivity } from '@ansible/nexus-contracts'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'

import { Details } from '../../../../components/details/Details'

import { renderCondition, renderOutputs, renderJson } from './common/detailRenderers'
import { handleStyle } from './common/handleStyle'
import { NodeBody } from './common/NodeBody'
import { NodeComponent } from './common/NodeComponent'
import { StandardNodeHeader } from './common/StandardNodeHeader'
import { nodeMetadata } from './nodeMetadata'

export type ConditionNode = { type: 'condition' } & Node<ConditionActivity>

export function ConditionNodeComponent(props: NodeProps<ConditionNode>) {
  const metadata = nodeMetadata.condition
  const Icon = metadata.icon!
  return (
    <NodeComponent className={metadata.className} nodeProps={props} disableSource>
      <ConditionNodeDetails conditionActivity={props.data} icon={<Icon />}>
        <NodeHandles>
          <NodeHandle id="true">True</NodeHandle>
          <NodeHandle id="false">False</NodeHandle>
        </NodeHandles>
      </ConditionNodeDetails>
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
      <StandardNodeHeader
        icon={props.icon}
        title={props.conditionActivity.name ?? 'Untitled Condition'}
        subtitle={metadata.label}
        expandable
      />
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
    <div className="group/handle relative rounded-l-4xl border-y-2 border-l-2 border-white/20 bg-white/10 px-3 py-1 hover:border-white/40 hover:bg-white/20">
      {props.children}
      <Handle
        type="source"
        id={props.id}
        position={Position.Right}
        style={{
          ...handleStyle,
          // Cover the entire label area to ensure ReactFlow detects the correct handle
          width: '100%',
          height: '100%',
          top: 15,
          right: 0,
          borderRadius: '0',
          opacity: 1,
        }}
      />
      {/* Visual indicator circle */}
    </div>
  )
}
