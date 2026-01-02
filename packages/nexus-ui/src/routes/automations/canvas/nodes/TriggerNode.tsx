import { FlexItem, Content, ContentVariants, Title, TitleSizes } from '@patternfly/react-core'
import { type Node, type NodeProps } from '@xyflow/react'
import type { WorkflowAPI } from 'nexus-contracts'

import { parseTriggerLabel } from '../../../../utils/triggerFormatting'

import { NodeBody } from './common/NodeBody'
import { NodeComponent } from './common/NodeComponent'
import { NodeHeader } from './common/NodeHeader'
import { NodeMenu } from './common/NodeMenu'
import { MenuNodeType, useNodeMenuActions } from './hooks/useNodeMenuActions'
import { nodeMetadata } from './nodeMetadata'

export type TriggerNode = { type: 'trigger' } & Node<{
  label: string
  inputs?: WorkflowAPI.components['schemas']['workflow-definition.schema']['inputs']
}>

export function TriggerNodeComponent(props: NodeProps<TriggerNode>) {
  const metadata = nodeMetadata.trigger
  const Icon = metadata.icon!

  // Extract trigger index from node id (format: trigger-0, trigger-1, etc.)
  const triggerIndex = Number.parseInt(props.id.split('-')[1])
  const menuActions = useNodeMenuActions({
    nodeId: props.id,
    nodeType: MenuNodeType.TRIGGER,
    triggerIndex,
  })

  return (
    <NodeComponent disableTarget={metadata.disableTarget} className={metadata.className} nodeProps={props}>
      <TriggerNodeDetails node={props.data} icon={<Icon />} menuActions={menuActions} />
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
  }>
) {
  const nodeData = props.node
  const { type, details } = parseTriggerLabel(nodeData.label)

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
            {type}
          </Title>
          {details && <Content component={ContentVariants.small}>{details}</Content>}
          {type === 'Manual' && !details && <Content component={ContentVariants.small}>Manual trigger</Content>}
        </div>
      </NodeBody>
    </>
  )
}
