import { KebabMenuTrigger, Menu, MenuItem, MenuItems } from '@ansible/nexus-ui-framework'
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
        <div className="ml-2">{props.icon && <NodeIcon>{props.icon}</NodeIcon>}</div>
        <div className="flex-1" />
        {props.menuActions && props.menuActions.length > 0 && (
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- Intentional for ReactFlow node interaction isolation
          <div
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="nodrag nopan -mr-2"
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
                    {action.icon && <span className="mr-2">{action.icon}</span>}
                    {action.label}
                  </MenuItem>
                ))}
              </MenuItems>
            </Menu>
          </div>
        )}
      </NodeHeader>
      <NodeBody>
        <div className="-mt-1 ml-2">
          <div className="text-sm font-semibold">{nodeData.label}</div>
          <div className="text-xs text-white/60">{'Manual trigger'}</div>
        </div>
      </NodeBody>
    </>
  )
}
