import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { FlexItem, Content, ContentVariants, Title, TitleSizes } from '@patternfly/react-core'
import { type Node, type NodeProps } from '@xyflow/react'
import type { CSSProperties } from 'react'

import { parseTriggerLabel } from '../../../../utils/triggerFormatting'
import { useIsExecutionView } from '../../../builder/ExecutionViewContext'

import { NodeBody } from './common/NodeBody'
import { NodeComponent } from './common/NodeComponent'
import { NodeHeader } from './common/NodeHeader'
import { NodeMenu } from './common/NodeMenu'
import { MenuNodeType, useNodeMenuActions } from './hooks/useNodeMenuActions'
import { nodeMetadata } from './nodeMetadata'

export type TriggerNode = { type: 'trigger' } & Node<{
  label: string
  triggerType?: string
  inputs?: WorkflowAPI.components['schemas']['workflow-definition.schema']['inputs']
}>

export function TriggerNodeComponent(props: NodeProps<TriggerNode>) {
  const { type: triggerType, details: triggerDetails } = parseTriggerLabel(props.data.label)
  const isScheduled = props.data.triggerType === 'scheduled'
  const metadata = isScheduled ? nodeMetadata.scheduledTrigger : nodeMetadata.trigger
  const Icon = metadata.icon!
  const triggerStyle: CSSProperties = {
    borderTopLeftRadius: '75px',
    borderBottomLeftRadius: '75px',
    paddingLeft: '25px',
  }

  // Extract trigger index from node id (format: trigger-0, trigger-1, etc.)
  const triggerIndex = Number.parseInt(props.id.split('-')[1])
  const menuActions = useNodeMenuActions({
    nodeId: props.id,
    nodeType: MenuNodeType.TRIGGER,
    triggerIndex,
  })

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

  // Show execution badge when in execution view
  const isExecutionView = useIsExecutionView()
  const showExecutionBadge =
    isExecutionView &&
    ((props.data as Record<string, unknown>).metadata as { __showExecutionBadge?: boolean } | undefined)
      ?.__showExecutionBadge === true

  return (
    <NodeComponent
      disableTarget={metadata.disableTarget}
      className={metadata.className}
      nodeProps={props}
      style={triggerStyle}
      collapsible={false}
      executionState={executionState}
      showExecutionBadge={showExecutionBadge}
    >
      <TriggerNodeDetails
        node={props.data}
        icon={<Icon />}
        menuActions={menuActions}
        triggerType={triggerType}
        triggerDetails={triggerDetails}
        triggerKind={props.data.triggerType}
      />
    </NodeComponent>
  )
}

export function TriggerNodeDetails(
  props: Readonly<{
    node: {
      label: string
      inputs?: WorkflowAPI.components['schemas']['workflow-definition.schema']['inputs']
    }
    icon?: React.ReactNode
    menuActions?: ReturnType<typeof useNodeMenuActions>
    triggerType: string
    triggerDetails: string | null
    triggerKind?: string
  }>
) {
  const isExecutionView = useIsExecutionView()
  const isManualTrigger = props.triggerKind === 'manual'
  const isScheduledTrigger = props.triggerKind === 'scheduled'
  const normalizedDetails = props.triggerDetails
    ? isManualTrigger
      ? props.triggerDetails.replace(/^Manual\b/, 'Manual trigger')
      : props.triggerDetails
    : null
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
          <Title headingLevel="h3" size={TitleSizes.md}>
            {props.triggerType}
          </Title>
          {isScheduledTrigger && normalizedDetails && (
            <Content component={ContentVariants.small}>Schedule trigger</Content>
          )}
          {normalizedDetails && (
            <Content component={ContentVariants.small} style={{ whiteSpace: 'pre-line' }}>
              {normalizedDetails}
            </Content>
          )}
          {isManualTrigger && !normalizedDetails && <Content component={ContentVariants.small}>Manual trigger</Content>}
        </div>
      </NodeBody>
    </>
  )
}
