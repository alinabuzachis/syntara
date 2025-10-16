import { type NodeTypes } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { type AgentNode, AgentNodeComponent } from './AgentNode'
import { type OutputNode, OutputNodeComponent } from './OutputNode'
import { type TaskNode, TaskNodeComponent } from './TaskNode'
import { type TriggerNode, TriggerNodeComponent } from './TriggerNode'

export type NodeType = TriggerNode | AgentNode | OutputNode | TaskNode

export const nodeTypes: NodeTypes = {
  trigger: TriggerNodeComponent,
  agent: AgentNodeComponent,
  result: OutputNodeComponent,
  task: TaskNodeComponent,
}
