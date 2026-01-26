import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { FlexItem, Content, ContentVariants, Title, TitleSizes } from '@patternfly/react-core'
import { type Node, type NodeProps } from '@xyflow/react'
import type { CSSProperties } from 'react'

import { parseTriggerLabel } from '../../../../utils/triggerFormatting'

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

  return (
    <NodeComponent
      disableTarget={metadata.disableTarget}
      className={metadata.className}
      nodeProps={props}
      style={triggerStyle}
      collapsible={false}
      executionState={executionState}
      showExecutionBadge={false}
    >
      <TriggerNodeDetails
        node={props.data}
        icon={<Icon />}
        menuActions={menuActions}
        triggerType={triggerType}
        triggerDetails={triggerDetails}
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
  }>
) {
  return (
    <>
      <NodeHeader>
        <FlexItem>{props.icon}</FlexItem>
        <FlexItem grow={{ default: 'grow' }} />
        {props.menuActions && props.menuActions.length > 0 && (
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
          {props.triggerDetails && (
            <Content component={ContentVariants.small} style={{ whiteSpace: 'pre-line' }}>
              {props.triggerDetails}
            </Content>
          )}
          {props.triggerType === 'Manual' && !props.triggerDetails && (
            <Content component={ContentVariants.small}>Manual trigger</Content>
          )}
        </div>
      </NodeBody>
    </>
  )
}
