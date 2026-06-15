import type { WaitActivity } from '@ansible/nexus-contracts'
import { type Node, type NodeProps } from '@xyflow/react'

import { NxDetailList } from '../../../../components/details/NxDetailList'
import { RegistryNodeId } from '../../../../constants'
import { formatDurationLabel } from '../../../builder/utils/timeUtils'
import type { ActivityStatus } from '../../execution/types'
import { getNodeTypeColor } from '../nodeTypeColors'
import { semanticZoomActivityTitle } from '../semanticZoom'

import { renderText } from './common/detailRenderers'
import { NodeBody } from './common/NodeBody'
import { NodeComponent } from './common/NodeComponent'
import { StandardNodeHeader } from './common/StandardNodeHeader'
import { MenuNodeType, useNodeMenuActions } from './hooks/useNodeMenuActions'
import { useWaitCountdown } from './hooks/useWaitCountdown'
import { nodeMetadata } from './nodeMetadata'
import { renderNodeIcon } from './renderNodeIcon'

export type WaitNode = { type: 'wait' } & Node<WaitActivity>

export function WaitNodeComponent(props: NodeProps<WaitNode>) {
  const metadata = nodeMetadata.wait
  const iconNode = renderNodeIcon(metadata.icon, RegistryNodeId.LOGIC_WAIT, 'canvas', getNodeTypeColor('wait'))
  const menuActions = useNodeMenuActions({
    nodeId: props.data.id,
    nodeType: MenuNodeType.ACTIVITY,
  })

  const executionState = (props.data as Record<string, unknown>).__executionState as
    | {
        status: ActivityStatus
        started_at?: string
        completed_at?: string
        error_details?: string
        retry_count?: number
      }
    | undefined

  const totalSeconds = (props.data.parameters as { duration?: number } | undefined)?.duration ?? 0
  const durationLabel = totalSeconds > 0 ? formatDurationLabel(totalSeconds) : 'Not configured'

  const { remaining } = useWaitCountdown(executionState?.status, executionState?.started_at, totalSeconds)

  return (
    <NodeComponent
      className={metadata.className}
      nodeProps={props}
      executionState={executionState}
      topBarColor={getNodeTypeColor('wait')}
      semanticZoomSummary={{
        title: semanticZoomActivityTitle(props.data.name, `Untitled ${metadata.label}`),
        typeLabel: metadata.label,
      }}
    >
      <StandardNodeHeader
        icon={iconNode}
        title={props.data.name ?? 'Untitled Wait'}
        subtitle={metadata.label}
        expandable={false}
        menuActions={menuActions}
      />
      <NodeBody>
        <NxDetailList>
          {renderText('Duration', durationLabel)}
          {remaining && renderText('⏱ Countdown', remaining)}
        </NxDetailList>
      </NodeBody>
    </NodeComponent>
  )
}
