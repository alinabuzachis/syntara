import { type NodeTypes } from '@xyflow/react'
import { type AgentNode, AgentNodeComponent } from './AgentNode'
import { type ConditionNode, ConditionNodeComponent } from './ConditionNode'
import { type JoinNode, JoinNodeComponent } from './JoinNode'
import { type OutputNode, OutputNodeComponent } from './OutputNode'
import { type TaskNode, TaskNodeComponent } from './TaskNode'
import { type TriggerNode, TriggerNodeComponent } from './TriggerNode'

export type NodeType = TriggerNode | AgentNode | OutputNode | TaskNode | ConditionNode | JoinNode

export const nodeTypes: NodeTypes = {
  trigger: TriggerNodeComponent,
  agent: AgentNodeComponent,
  result: OutputNodeComponent,
  task: TaskNodeComponent,
  condition: ConditionNodeComponent,
  join: JoinNodeComponent,
}
