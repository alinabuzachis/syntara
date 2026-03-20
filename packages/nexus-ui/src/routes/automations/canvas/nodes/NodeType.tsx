import { type NodeTypes } from '@xyflow/react'

import { FlowNodeType } from '../../../../constants'

import { type ApprovalNode, ApprovalNodeComponent } from './ApprovalNode'
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
  | ApprovalNode
  | ConditionNode
  | ConvergeNode
  | ParallelNode
  | LoopNode
  | GenericNode

export const nodeTypes: NodeTypes = {
  [FlowNodeType.TRIGGER]: TriggerNodeComponent,
  [FlowNodeType.TASK]: TaskNodeComponent,
  [FlowNodeType.TASK_REVERSED]: TaskReversedNodeComponent,
  [FlowNodeType.APPROVAL]: ApprovalNodeComponent,
  [FlowNodeType.CONDITION]: ConditionNodeComponent,
  [FlowNodeType.CONVERGE]: ConvergeNodeComponent,
  [FlowNodeType.PARALLEL]: ParallelNodeComponent,
  [FlowNodeType.LOOP]: LoopNodeComponent,
  [FlowNodeType.GENERIC]: GenericNodeComponent,
}
