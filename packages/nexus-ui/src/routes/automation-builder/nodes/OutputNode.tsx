import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useContext } from 'react'
import { FlowDirectionContext } from '../FlowDirectionContext'

export type OutputNode = { type: 'result' } & Node<{
  label: string
  description?: string
  integrations?: Array<string>
}>

export function OutputNodeComponent(props: NodeProps<OutputNode>) {
  const [flowDirection] = useContext(FlowDirectionContext)
  return (
    <>
      <div>
        <label className="text-lg font-bold">{props.data.label}</label>
        <div className="text-xs text-white/60">Result</div>
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
      <Handle type="target" id="top" position={Position.Top} style={{ opacity: flowDirection === 'TB' ? 1 : 0 }} />
      <Handle type="target" id="left" position={Position.Left} style={{ opacity: flowDirection === 'LR' ? 1 : 0 }} />
    </>
  )
}
