import type { ConvergeActivity } from '@ansible/nexus-contracts'
import { Flex } from '@patternfly/react-core'
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
  const strategy = props.data.converge?.strategy ?? 'all'
  const strategyLabel = strategy === 'any' ? 'Any' : 'All'

  // Extract execution state if present
  const executionState = (props.data as Record<string, unknown>).__executionState as
    | {
        status: string
        started_at?: string
        completed_at?: string
        error_details?: string
        retry_count?: number
      }
    | undefined

  return (
    <NodeComponent className={metadata.className} nodeProps={props} executionState={executionState}>
      <StandardNodeHeader
        icon={
          <div style={{ transform: 'rotate(90deg)', display: 'inline-block' }}>
            <Icon />
          </div>
        }
        title={props.data.name}
        subtitle={metadata.label}
        expandable
      />
      <Flex justifyContent={{ default: 'justifyContentFlexStart' }} style={{ overflow: 'hidden' }}>
        <NodeBody>
          <Details>
            <Detail label="Type">{strategyLabel}</Detail>
          </Details>
        </NodeBody>
      </Flex>
    </NodeComponent>
  )
}
