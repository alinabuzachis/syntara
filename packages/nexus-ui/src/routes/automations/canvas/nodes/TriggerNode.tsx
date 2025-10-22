import { type Node, type NodeProps } from '@xyflow/react'
import { PlayCircleIcon } from 'lucide-react'
import { NodeComponent } from './common/NodeComponent'
import { NodeTitle } from './common/NodeTitle'

export type TriggerNode = { type: 'trigger' } & Node<{
  label: string
  description?: string
  integrations?: Array<string>
}>
export function TriggerNodeComponent(props: NodeProps<TriggerNode>) {
  return (
    <NodeComponent disableTarget className="rounded-4xl rounded-l-[128px]">
      <NodeTitle type="Trigger" name={props.data.label} icon={<PlayCircleIcon />} />
      {props.data.description && <div className="text-pretty">{props.data.description}</div>}
      {props.data.integrations && (
        <div>
          <div className="text-white/70">Integrations</div>
          <ul className="mt-1 flex">
            {props.data.integrations.map((integration) => (
              <li className="rounded-xl bg-white/10 px-4 py-0" key={integration}>
                {integration}
              </li>
            ))}
          </ul>
        </div>
      )}
    </NodeComponent>
  )
}
