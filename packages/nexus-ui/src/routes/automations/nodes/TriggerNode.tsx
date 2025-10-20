import { type Node, type NodeProps } from '@xyflow/react'
import { DirectionNodeComponent } from './DirectionNode'

export type TriggerNode = { type: 'trigger' } & Node<{
  label: string
  description?: string
  integrations?: Array<string>
}>
export function TriggerNodeComponent(props: NodeProps<TriggerNode>) {
  return (
    <DirectionNodeComponent disableTarget className="rounded-4xl rounded-l-[128px]">
      <div>
        <label className="text-lg font-bold">{props.data.label}</label>
        <div className="text-xs text-white/60">Trigger</div>
      </div>
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
    </DirectionNodeComponent>
  )
}
