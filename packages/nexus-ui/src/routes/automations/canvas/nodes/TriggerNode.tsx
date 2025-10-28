import { type Node, type NodeProps } from '@xyflow/react'
import { PlayCircleIcon } from 'lucide-react'
import type { WorkflowAPI } from 'nexus-contracts'
import { CodeBlock } from '../../../../components/details/CodeBlock'
import { Detail } from '../../../../components/details/Detail'
import { Details } from '../../../../components/details/Details'
import { NodeBody } from './common/NodeBody'
import { NodeComponent } from './common/NodeComponent'
import { NodeHeader } from './common/NodeHeader'
import { NodeIcon } from './common/NodeIcon'
import { NodeTitle } from './common/NodeTitle'

export type TriggerNode = { type: 'trigger' } & Node<{
  label: string
  inputs?: WorkflowAPI.components['schemas']['workflow-definition.schema']['inputs']
}>

export function TriggerNodeComponent(props: NodeProps<TriggerNode>) {
  return (
    <NodeComponent disableTarget className="rounded-4xl rounded-l-[48px] border-l-8 pl-2" nodeProps={props}>
      <TriggerNodeDetails node={props.data} />
    </NodeComponent>
  )
}

export function TriggerNodeDetails(props: {
  node: {
    label: string
    inputs?: WorkflowAPI.components['schemas']['workflow-definition.schema']['inputs']
  }
}) {
  const nodeData = props.node

  return (
    <>
      <NodeHeader>
        <NodeIcon>
          <PlayCircleIcon />
        </NodeIcon>
        <NodeTitle subTitle="Trigger" title={nodeData.label} />
      </NodeHeader>
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
