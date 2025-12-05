import { type NodeTypes } from '@xyflow/react'

import { type ConditionNode, ConditionNodeComponent } from './ConditionNode'
import { type ConvergeNode, ConvergeNodeComponent } from './ConvergeNode'
import { type GenericNode, GenericNodeComponent } from './GenericNode'
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
  | ConvergeNode
  | ParallelNode
  | LoopNode
  | GenericNode

export const nodeTypes: NodeTypes = {
  trigger: TriggerNodeComponent,
  task: TaskNodeComponent,
  'task-reversed': TaskReversedNodeComponent,
  condition: ConditionNodeComponent,
  converge: ConvergeNodeComponent,
  parallel: ParallelNodeComponent,
  loop: LoopNodeComponent,
  generic: GenericNodeComponent,
}
