import { type Node, type NodeProps } from '@xyflow/react'
import { PlayCircleIcon } from 'lucide-react'
import type { WorkflowAPI } from 'nexus-contracts'
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
    <NodeComponent disableTarget className="rounded-4xl rounded-l-[80px] border-l-16 pl-6">
      <NodeHeader>
        <NodeIcon>
          <PlayCircleIcon />
        </NodeIcon>
        <NodeTitle subTitle="Trigger" title={props.data.label} />
      </NodeHeader>
      <NodeBody>
        <Details>
          {props.data.inputs && (
            <Detail label="Inputs">
              <ul className="mt-1 flex flex-col gap-1">
                {Object.entries(props.data.inputs).map(([inputName, inputDef]) => (
                  <li className="rounded-xl bg-black/30 px-4 py-2" key={inputName}>
                    <span className="font-mono font-bold">{inputName}</span>: {inputDef.type}
                  </li>
                ))}
              </ul>
            </Detail>
          )}
        </Details>
      </NodeBody>
    </NodeComponent>
  )
}
