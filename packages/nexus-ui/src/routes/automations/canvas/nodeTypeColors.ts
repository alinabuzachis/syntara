import { ActivityTypeEnum, ExecutorTypeEnum, type TaskActivity } from '@ansible/nexus-contracts'

import { FlowNodeType, RegistryNodeId } from '../../../constants'

import { detectTaskNodeType, DetectedExecutorType } from './nodes/common/detectTaskNodeType'

/**
 * PatternFly theme tokens for workflow step type indicators on the canvas (UX-aligned).
 * Used for the colored bar and icon on each node. Chosen to match UX spec:
 * Logic F89B78 → orange, AI agent 92C5F9 → blue, Action B6A6E9 → purple,
 * Approval 9AD8D8 → teal, AAP E0E0E0 → gray. Approved/Rejected use success/danger.
 */
export const NODE_TYPE_COLORS = {
  trigger: 'var(--pf-t--global--color--nonstatus--gray--300)',
  logic: 'var(--pf-t--global--color--nonstatus--orangered--200)',
  approval: 'var(--pf-t--global--color--nonstatus--teal--100)',
  actionScript: 'var(--pf-t--global--color--nonstatus--purple--200)',
  actionAap: 'var(--pf-t--global--color--nonstatus--gray--100)',
  actionAgentic: 'var(--pf-t--global--color--nonstatus--blue--200)',
  actionDefault: 'var(--pf-t--global--color--nonstatus--purple--200)',
  generic: 'var(--pf-t--global--color--nonstatus--gray--300)',
} as const

export type NodeTypeColorKey = keyof typeof NODE_TYPE_COLORS

/**
 * Returns the color token for the colored bar at the top of a workflow step (React Flow node).
 * Uses node type and, for task nodes, the resolved executor (script, aap, agentic, etc.).
 */
export function getNodeTypeColor(nodeType: string, data?: { type?: string; task?: { executor?: string } }): string {
  if (nodeType === FlowNodeType.TRIGGER) {
    return NODE_TYPE_COLORS.trigger
  }
  if (nodeType === ActivityTypeEnum.APPROVAL) {
    return NODE_TYPE_COLORS.approval
  }
  if (
    nodeType === ActivityTypeEnum.CONDITION ||
    nodeType === ActivityTypeEnum.LOOP ||
    nodeType === ActivityTypeEnum.CONVERGE ||
    nodeType === ActivityTypeEnum.PARALLEL
  ) {
    return NODE_TYPE_COLORS.logic
  }
  if (nodeType === FlowNodeType.GENERIC) {
    return NODE_TYPE_COLORS.generic
  }
  if (nodeType === FlowNodeType.TASK || nodeType === FlowNodeType.TASK_REVERSED) {
    return getTaskNodeColor(data as TaskActivity | undefined)
  }
  return NODE_TYPE_COLORS.actionDefault
}

function getTaskNodeColor(data: TaskActivity | undefined): string {
  if (!data?.task?.executor) {
    return NODE_TYPE_COLORS.actionDefault
  }
  const { actualExecutor } = detectTaskNodeType(data)
  if (actualExecutor === ExecutorTypeEnum.SCRIPT) {
    return NODE_TYPE_COLORS.actionScript
  }
  if (actualExecutor === ExecutorTypeEnum.AAP_JOB_TEMPLATE || actualExecutor === DetectedExecutorType.AAP) {
    return NODE_TYPE_COLORS.actionAap
  }
  if (actualExecutor === ExecutorTypeEnum.AGENTIC) {
    return NODE_TYPE_COLORS.actionAgentic
  }
  return NODE_TYPE_COLORS.actionDefault
}

const ADD_PANEL_TRIGGER_IDS: readonly string[] = [
  RegistryNodeId.TRIGGER,
  RegistryNodeId.TRIGGER_MANUAL,
  RegistryNodeId.TRIGGER_SCHEDULED,
]

const ADD_PANEL_LOGIC_IDS: readonly string[] = [
  RegistryNodeId.LOGIC,
  RegistryNodeId.LOGIC_CONDITION,
  RegistryNodeId.LOGIC_CONVERGE,
  RegistryNodeId.LOGIC_LOOP,
]

const ADD_PANEL_ACTION_IDS: readonly string[] = [
  RegistryNodeId.ACTION,
  RegistryNodeId.ACTION_SCRIPT,
  RegistryNodeId.ACTION_API,
]

/**
 * Returns the accent color for a card in the Add step panel (registry node type or subtype id).
 * Trigger has no accent; AAP uses gray; other types match canvas node colors.
 */
export function getAddNodePanelColor(registryNodeId: string): string | undefined {
  if (!registryNodeId) return undefined
  if (ADD_PANEL_TRIGGER_IDS.includes(registryNodeId)) return undefined
  if (ADD_PANEL_LOGIC_IDS.includes(registryNodeId)) return NODE_TYPE_COLORS.logic
  if (registryNodeId === RegistryNodeId.APPROVAL) return NODE_TYPE_COLORS.approval
  if (ADD_PANEL_ACTION_IDS.includes(registryNodeId)) return NODE_TYPE_COLORS.actionScript
  if (registryNodeId === RegistryNodeId.AGENT) return NODE_TYPE_COLORS.actionAgentic
  if (registryNodeId === RegistryNodeId.AAP) return NODE_TYPE_COLORS.actionAap
  return undefined
}
