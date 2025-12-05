import { type NodeTypes } from '@xyflow/react'

import { type ConditionNode, ConditionNodeComponent } from './ConditionNode'
import { type GenericNode, GenericNodeComponent } from './GenericNode'
import { type JoinNode, JoinNodeComponent } from './JoinNode'
import { type LoopNode, LoopNodeComponent } from './LoopNode'
import { type ParallelNode, ParallelNodeComponent } from './ParallelNode'
import { type TaskNode, TaskNodeComponent } from './TaskNode'
import { type TaskReversedNode, TaskReversedNodeComponent } from './TaskReversedNode'
import { type TriggerNode, TriggerNodeComponent } from './TriggerNode'

export type NodeType =
  | TriggerNode
  | TaskNode
  | TaskReversedNode
  | ConditionNode
  | JoinNode
  | ParallelNode
  | LoopNode
  | GenericNode

export const nodeTypes: NodeTypes = {
  trigger: TriggerNodeComponent,
  task: TaskNodeComponent,
  'task-reversed': TaskReversedNodeComponent,
  condition: ConditionNodeComponent,
  join: JoinNodeComponent,
  parallel: ParallelNodeComponent,
  loop: LoopNodeComponent,
  generic: GenericNodeComponent,
}
