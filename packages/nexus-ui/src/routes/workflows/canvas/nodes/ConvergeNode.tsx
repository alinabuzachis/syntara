import { ActivityTypeEnum, type ConvergeActivity } from '@ansible/nexus-contracts'
import { Flex } from '@patternfly/react-core'
import { type Node, type NodeProps } from '@xyflow/react'

import { Detail } from '../../../../components/details/Detail'
import { Details } from '../../../../components/details/Details'
import { RegistryNodeId } from '../../../../constants'
import type { ActivityStatus } from '../../execution/types'
import { getNodeTypeColor } from '../nodeTypeColors'
import { semanticZoomActivityTitle } from '../semanticZoom'

import { NodeBody } from './common/NodeBody'
import { NodeComponent } from './common/NodeComponent'
import { StandardNodeHeader } from './common/StandardNodeHeader'
import { nodeMetadata } from './nodeMetadata'
import { renderNodeIcon } from './renderNodeIcon'

export type ConvergeNode = { type: 'converge' } & Node<ConvergeActivity>

export function ConvergeNodeComponent(props: NodeProps<ConvergeNode>) {
  const metadata = nodeMetadata.converge
  const iconNode = renderNodeIcon(
    metadata.icon,
    RegistryNodeId.LOGIC_CONVERGE,
    'canvas',
    getNodeTypeColor(ActivityTypeEnum.CONVERGE)
  )
  // In v2, strategy is at config.strategy (not converge.strategy)
  const config = (props.data.config ?? {}) as { strategy?: 'all' | 'any' }
  const strategyLabel = config.strategy === 'any' ? 'Any' : 'All'

  // Extract execution state if present
  const executionState = (props.data as Record<string, unknown>).__executionState as
    | {
        status: ActivityStatus
        started_at?: string
        completed_at?: string
        error_details?: string
        retry_count?: number
      }
    | undefined

  return (
    <NodeComponent
      className={metadata.className}
      nodeProps={props}
      executionState={executionState}
      topBarColor={getNodeTypeColor('converge')}
      rootTestId="converge-node"
      semanticZoomSummary={{
        title: semanticZoomActivityTitle(props.data.name, `Untitled ${metadata.label}`),
        typeLabel: metadata.label,
      }}
    >
      <StandardNodeHeader icon={iconNode} title={props.data.name} subtitle={metadata.label} expandable />
      <Flex justifyContent={{ default: 'justifyContentFlexStart' }} style={{ overflow: 'hidden' }}>
        <NodeBody>
          <Details data-testid="converge-node-details">
            <Detail label="Type">{strategyLabel}</Detail>
          </Details>
        </NodeBody>
      </Flex>
    </NodeComponent>
  )
}
