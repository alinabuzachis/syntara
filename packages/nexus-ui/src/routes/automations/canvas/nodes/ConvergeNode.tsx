import type { ConvergeActivity } from '@ansible/nexus-contracts'
import { type Node, type NodeProps } from '@xyflow/react'

import { Detail } from '../../../../components/details/Detail'
import { Details } from '../../../../components/details/Details'

import { NodeBody } from './common/NodeBody'
import { NodeComponent } from './common/NodeComponent'
import { StandardNodeHeader } from './common/StandardNodeHeader'
import { nodeMetadata } from './nodeMetadata'

export type ConvergeNode = { type: 'converge' } & Node<ConvergeActivity>

export function ConvergeNodeComponent(props: NodeProps<ConvergeNode>) {
  const metadata = nodeMetadata.converge
  const Icon = metadata.icon!
  const timeout = props.data.converge?.timeout
  const onTimeout = props.data.converge?.onTimeout ?? 'fail'
  const aggregateOutputs = props.data.converge?.aggregateOutputs ?? true

  return (
    <NodeComponent className={metadata.className} nodeProps={props}>
      <StandardNodeHeader
        icon={<Icon className="rotate-90" />}
        title={props.data.name}
        subtitle={metadata.label}
        expandable
      />
      <div className="justify-left flex overflow-hidden">
        <NodeBody>
          <Details>
            <Detail label="Strategy">all</Detail>
            {timeout && <Detail label="Timeout">{timeout}</Detail>}
            <Detail label="On Timeout">{onTimeout}</Detail>
            <Detail label="Aggregate Outputs">{aggregateOutputs ? 'Yes' : 'No'}</Detail>
          </Details>
        </NodeBody>
      </div>
    </NodeComponent>
  )
}
