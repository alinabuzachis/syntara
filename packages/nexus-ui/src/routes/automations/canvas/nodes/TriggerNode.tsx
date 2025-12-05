import { type Node, type NodeProps } from '@xyflow/react'
import type { WorkflowAPI } from 'nexus-contracts'

import { CodeBlock } from '../../../../components/details/CodeBlock'
import { Detail } from '../../../../components/details/Detail'
import { Details } from '../../../../components/details/Details'

import { NodeBody } from './common/NodeBody'
import { NodeComponent } from './common/NodeComponent'
import { StandardNodeHeader } from './common/StandardNodeHeader'
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
  const metadata = nodeMetadata.trigger

  return (
    <>
      <StandardNodeHeader
        icon={props.icon}
        title={nodeData.label}
        subtitle={metadata.label}
        menuActions={props.menuActions}
      />
      {nodeData.inputs && Object.keys(nodeData.inputs).length > 0 && (
        <NodeBody>
          <Details>
            <Detail label="Inputs">
              <CodeBlock>
                <ul className="flex flex-col gap-1">
                  {Object.entries(nodeData.inputs).map(([inputName, inputDef]) => (
                    <li key={inputName}>
                      <span className="font-mono font-bold">{inputName}</span>: {inputDef.type}
                    </li>
                  ))}
                </ul>
              </CodeBlock>
            </Detail>
          </Details>
        </NodeBody>
      )}
    </>
  )
}
