import { type NodeTypes } from '@xyflow/react'
import { type ConditionNode, ConditionNodeComponent } from './ConditionNode'
import { type JoinNode, JoinNodeComponent } from './JoinNode'
import { type TaskNode, TaskNodeComponent } from './TaskNode'
import { type TriggerNode, TriggerNodeComponent } from './TriggerNode'

export type NodeType = TriggerNode | TaskNode | ConditionNode | JoinNode

export const nodeTypes: NodeTypes = {
  trigger: TriggerNodeComponent,
  task: TaskNodeComponent,
  condition: ConditionNodeComponent,
  join: JoinNodeComponent,
}
