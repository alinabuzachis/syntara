import { TriggerTypeEnum, type WorkflowAPI } from '@ansible/nexus-contracts'
import { FlexItem, Content, ContentVariants, Title, TitleSizes } from '@patternfly/react-core'
import { type Node, type NodeProps } from '@xyflow/react'
import type { CSSProperties } from 'react'

import { FlowNodeType } from '../../../../constants'
import { parseTriggerIndex } from '../../../../utils/triggerNodeIds'
import { useIsExecutionView } from '../../../builder/ExecutionViewContext'
import type { ActivityStatus } from '../../execution/types'
import { getNodeTypeColor } from '../nodeTypeColors'
import { semanticZoomActivityTitle } from '../semanticZoom'

import { NodeBody } from './common/NodeBody'
import { NodeComponent } from './common/NodeComponent'
import { NodeHeader } from './common/NodeHeader'
import { NodeMenu } from './common/NodeMenu'
import { MenuNodeType, useNodeMenuActions } from './hooks/useNodeMenuActions'
import { nodeMetadata } from './nodeMetadata'
import { renderNodeIcon } from './renderNodeIcon'

export type TriggerNode = { type: 'trigger' } & Node<{
  name: string
  details: string | null
  triggerType?: string
  config?: WorkflowAPI.components['schemas']['configSchema']
}>

export function TriggerNodeComponent(props: NodeProps<TriggerNode>) {
  const triggerName = props.data.name
  const triggerDetails = props.data.details
  const isScheduled = props.data.triggerType === TriggerTypeEnum.SCHEDULED
  const metadata = isScheduled ? nodeMetadata.scheduledTrigger : nodeMetadata.trigger
  const iconId = isScheduled ? 'trigger-scheduled' : 'trigger-manual'
  const iconNode = renderNodeIcon(metadata.icon, iconId)
  // 75px border-radius is a layout constraint (pill shape), not a spacing value — no semantic token applies
  const triggerStyle: CSSProperties = {
    borderTopLeftRadius: '75px',
    borderBottomLeftRadius: '75px',
    paddingLeft: 'var(--pf-t--global--spacer--lg)',
  }

  // Extract trigger index from node id (format: trigger-0, trigger-1, etc.)
  const triggerIndex = parseTriggerIndex(props.id) ?? 0
  const menuActions = useNodeMenuActions({
    nodeId: props.id,
    nodeType: MenuNodeType.TRIGGER,
    triggerIndex,
  })

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

  const showExecutionBadge =
    ((props.data as Record<string, unknown>).metadata as { __showExecutionBadge?: boolean } | undefined)
      ?.__showExecutionBadge === true

  const triggerTypeLabel = props.data.triggerType === TriggerTypeEnum.SCHEDULED ? 'Scheduled trigger' : 'Manual trigger'

  return (
    <NodeComponent
      disableTarget={metadata.disableTarget}
      className={metadata.className}
      nodeProps={props}
      style={triggerStyle}
      collapsible={false}
      executionState={executionState}
      showExecutionBadge={showExecutionBadge}
      topBarColor={getNodeTypeColor(FlowNodeType.TRIGGER)}
      semanticZoomSummary={{
        title: semanticZoomActivityTitle(triggerName, `Untitled ${metadata.label}`),
        typeLabel: triggerTypeLabel,
      }}
    >
      <TriggerNodeDetails
        node={props.data}
        icon={iconNode}
        menuActions={menuActions}
        triggerName={triggerName}
        triggerDetails={triggerDetails}
        triggerKind={props.data.triggerType}
      />
    </NodeComponent>
  )
}

function TriggerNodeDetails(
  props: Readonly<{
    node: {
      name: string
      details: string | null
      config?: WorkflowAPI.components['schemas']['configSchema']
    }
    icon?: React.ReactNode
    menuActions?: ReturnType<typeof useNodeMenuActions>
    triggerName: string
    triggerDetails: string | null
    triggerKind?: string
  }>
) {
  const isExecutionView = useIsExecutionView()
  const isManualTrigger = props.triggerKind === TriggerTypeEnum.MANUAL_TRIGGER
  const isScheduledTrigger = props.triggerKind === TriggerTypeEnum.SCHEDULED
  const normalizedDetails = props.triggerDetails ?? null
  return (
    <>
      <NodeHeader>
        <FlexItem>{props.icon}</FlexItem>
        <FlexItem grow={{ default: 'grow' }} />
        {props.menuActions && props.menuActions.length > 0 && !isExecutionView && (
          <FlexItem>
            <NodeMenu menuActions={props.menuActions} />
          </FlexItem>
        )}
      </NodeHeader>
      <NodeBody>
        <div>
          <Title headingLevel="h3" size={TitleSizes.md} style={{ overflowWrap: 'anywhere' }}>
            {props.triggerName}
          </Title>
          {isScheduledTrigger && normalizedDetails && (
            <Content component={ContentVariants.small}>Schedule trigger</Content>
          )}
          {normalizedDetails && (
            <Content component={ContentVariants.small} style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
              {normalizedDetails}
            </Content>
          )}
          {isManualTrigger && !normalizedDetails && <Content component={ContentVariants.small}>Manual trigger</Content>}
        </div>
      </NodeBody>
    </>
  )
}
