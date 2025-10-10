import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useContext } from 'react'
import { FlowDirectionContext } from '../FlowDirectionContext'

export type AgentNode = { type: 'agent' } & Node<{
  label: string
  description?: string
  model: string
  steps?: {
    label: string
    description?: string
    status: 'pending' | 'in-progress' | 'completed' | 'failed'
  }[]
}>
export function AgentNodeComponent(props: NodeProps<AgentNode>) {
  const [flowDirection] = useContext(FlowDirectionContext)

  return (
    <>
      <div>
        <label className="text-lg font-bold">{props.data.label}</label>
        <div className="text-xs text-white/60">Agent</div>
      </div>
      {props.data.description && <div className="text-pretty">{props.data.description}</div>}
      {props.data.model && (
        <div>
          <div className="text-white/70">Model</div>
          <div className="text-pretty">{props.data.model}</div>
        </div>
      )}
      {
        props.data.steps && props.data.steps.length > 0 && (
          <div>
            <div className="text-white/70">Steps</div>
            <ul className="mt-1 flex flex-col gap-4">
              {props.data.steps.map((step, index) => (
                <li className="flex items-center space-x-2" key={`${step.label}-${index}`}>
                  <div
                    className={`h-3 w-3 rounded-full border ${
                      step.status === 'pending'
                        ? 'border-white/30 bg-white/10'
                        : step.status === 'in-progress'
                          ? 'animate-pulse border-blue-500 bg-blue-500'
                          : step.status === 'completed'
                            ? 'border-green-500 bg-green-500'
                            : step.status === 'failed'
                              ? 'border-red-500 bg-red-500'
                              : 'border-white/30 bg-white/10'
                    }`}
                  />
                  <div className="flex-1">
                    <div className="text-sm">{step.label}</div>
                    {step.description && <div className="text-xs text-white/60">{step.description}</div>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )
        // : (
        //   <div className="text-white/60 italic">No steps defined</div>
        // )
      }
      <Handle type="target" id="top" position={Position.Top} style={{ opacity: flowDirection === 'TB' ? 1 : 0 }} />
      <Handle type="target" id="left" position={Position.Left} style={{ opacity: flowDirection === 'LR' ? 1 : 0 }} />
      <Handle
        type="source"
        id="bottom"
        position={Position.Bottom}
        style={{ opacity: flowDirection === 'TB' ? 1 : 0 }}
      />
      <Handle type="source" id="right" position={Position.Right} style={{ opacity: flowDirection === 'LR' ? 1 : 0 }} />
    </>
  )
}
