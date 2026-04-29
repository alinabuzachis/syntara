import { type Node, type NodeTypes } from '@xyflow/react'

import { FlowNodeType } from '../../../../constants'

import { type ApprovalNode, ApprovalNodeComponent } from './ApprovalNode'
import { type ConditionNode, ConditionNodeComponent } from './ConditionNode'
import { type ConvergeNode, ConvergeNodeComponent } from './ConvergeNode'
import { type GenericNode, GenericNodeComponent } from './GenericNode'
import { type LoopNode, LoopNodeComponent } from './LoopNode'
import { type TaskNode, TaskNodeComponent } from './TaskNode'
import { type TaskReversedNode, TaskReversedNodeComponent } from './TaskReversedNode'
import { type TriggerNode, TriggerNodeComponent } from './TriggerNode'

/** Invisible React Flow node used only as a valid target for button edges (not a workflow step). */
export type ButtonEdgePlaceholderNode = Node<Record<string, unknown>, typeof FlowNodeType.PLACEHOLDER>

export type NodeType =
  | TriggerNode
  | TaskNode
  | TaskReversedNode
  | ApprovalNode
  | ConditionNode
  | ConvergeNode
  | LoopNode
  | GenericNode
  | ButtonEdgePlaceholderNode

export const nodeTypes: NodeTypes = {
  [FlowNodeType.TRIGGER]: TriggerNodeComponent,
  [FlowNodeType.TASK]: TaskNodeComponent,
  [FlowNodeType.TASK_REVERSED]: TaskReversedNodeComponent,
  [FlowNodeType.APPROVAL]: ApprovalNodeComponent,
  [FlowNodeType.CONDITION]: ConditionNodeComponent,
  [FlowNodeType.CONVERGE]: ConvergeNodeComponent,
  [FlowNodeType.LOOP]: LoopNodeComponent,
  [FlowNodeType.GENERIC]: GenericNodeComponent,
}
