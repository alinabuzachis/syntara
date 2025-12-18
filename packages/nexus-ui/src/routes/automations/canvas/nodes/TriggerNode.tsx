import { KebabMenuTrigger, Menu, MenuItem, MenuItems } from '@ansible/nexus-ui-framework'
import { FlexItem, Content, ContentVariants, Title, TitleSizes } from '@patternfly/react-core'
import { type Node, type NodeProps } from '@xyflow/react'
import type { WorkflowAPI } from 'nexus-contracts'

import { NodeBody } from './common/NodeBody'
import { NodeComponent } from './common/NodeComponent'
import { NodeHeader } from './common/NodeHeader'
import { NodeIcon } from './common/NodeIcon'
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

  return (
    <>
      <NodeHeader>
        <FlexItem style={{ marginLeft: 'var(--pf-t--global--spacer--sm)' }}>
          {props.icon && <NodeIcon>{props.icon}</NodeIcon>}
        </FlexItem>
        <FlexItem grow={{ default: 'grow' }} />
        {props.menuActions && props.menuActions.length > 0 && (
          <FlexItem>
            <div
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation()
                }
              }}
              className="nodrag nopan"
              style={{ marginRight: 'calc(-1 * var(--pf-t--global--spacer--sm))' }}
              role="button"
              tabIndex={0}
            >
              <Menu>
                <KebabMenuTrigger label="Node actions menu" />
                <MenuItems>
                  {props.menuActions.map((action) => (
                    <MenuItem
                      key={action.id}
                      onClick={() => {
                        action.onClick()
                      }}
                      className={action.variant === 'danger' ? 'menu-item-danger' : ''}
                    >
                      {action.icon && (
                        <span style={{ marginRight: 'var(--pf-t--global--spacer--sm)' }}>{action.icon}</span>
                      )}
                      {action.label}
                    </MenuItem>
                  ))}
                </MenuItems>
              </Menu>
            </div>
          </FlexItem>
        )}
      </NodeHeader>
      <NodeBody>
        <div
          style={{
            marginTop: 'calc(-1 * var(--pf-t--global--spacer--xs))',
            marginLeft: 'var(--pf-t--global--spacer--sm)',
          }}
        >
          <Title headingLevel="h3" size={TitleSizes.sm}>
            {nodeData.label}
          </Title>
          <Content component={ContentVariants.small} style={{ color: 'var(--pf-t--global--color--white--600)' }}>
            Manual trigger
          </Content>
        </div>
      </NodeBody>
    </>
  )
}
