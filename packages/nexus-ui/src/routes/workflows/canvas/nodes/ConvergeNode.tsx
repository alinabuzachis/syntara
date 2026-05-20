import { ActivityTypeEnum, type ConvergeActivity } from '@ansible/nexus-contracts'
import { Flex } from '@patternfly/react-core'
import { type Node, type NodeProps } from '@xyflow/react'

import { NxDetail } from '../../../../components/details/NxDetail'
import { NxDetailList } from '../../../../components/details/NxDetailList'
import { RegistryNodeId } from '../../../../constants'
import type { ActivityStatus } from '../../execution/types'
import { getNodeTypeColor } from '../nodeTypeColors'
import { semanticZoomActivityTitle } from '../semanticZoom'

import { NodeBody } from './common/NodeBody'
import { NodeComponent } from './common/NodeComponent'
import { StandardNodeHeader } from './common/StandardNodeHeader'
import { MenuNodeType, useNodeMenuActions } from './hooks/useNodeMenuActions'
import { nodeMetadata } from './nodeMetadata'
import { renderNodeIcon } from './renderNodeIcon'

function getStrategyLabel(strategy?: 'all' | 'any', nRequired?: number): string {
  if (strategy !== 'any') return 'All'
  return nRequired != null && nRequired > 0 ? `Any ${nRequired}` : 'Any'
}

export type ConvergeNode = { type: 'converge' } & Node<ConvergeActivity>

export function ConvergeNodeComponent(props: NodeProps<ConvergeNode>) {
  const metadata = nodeMetadata.converge
  const iconNode = renderNodeIcon(
    metadata.icon,
    RegistryNodeId.LOGIC_CONVERGE,
    'canvas',
    getNodeTypeColor(ActivityTypeEnum.CONVERGE)
  )
  const menuActions = useNodeMenuActions({
    nodeId: props.data.id,
    nodeType: MenuNodeType.ACTIVITY,
  })
  const config = (props.data.config ?? {}) as { strategy?: 'all' | 'any'; n_required?: number }
  const strategyLabel = getStrategyLabel(config.strategy, config.n_required)

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
      <StandardNodeHeader icon={iconNode} title={props.data.name} subtitle={metadata.label} expandable menuActions={menuActions} />
      <Flex justifyContent={{ default: 'justifyContentFlexStart' }} style={{ overflow: 'hidden' }}>
        <NodeBody>
          <NxDetailList data-testid="converge-node-details">
            <NxDetail label="Type">{strategyLabel}</NxDetail>
          </NxDetailList>
        </NodeBody>
      </Flex>
    </NodeComponent>
  )
}
