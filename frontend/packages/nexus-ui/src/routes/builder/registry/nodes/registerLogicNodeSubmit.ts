import { ActivityTypeEnum, EdgeHandleEnum } from '@ansible/nexus-contracts'

import { RegistryNodeId } from '../../../../constants'
import {
  createConditionActivity,
  createConvergeActivity,
  createGenericActivity,
  createLoopActivity,
  createSwitchActivity,
  createWaitActivity,
  useWorkflowStore,
} from '../../../../stores/useWorkflowStore'
import type { LogicFormData } from '../../node-forms/LogicNodeForm'
import { getDefaultNodeBaseName, getNodeDisplayName } from '../../utils/nodeNaming'
import { buildSwitchCasePort } from '../../utils/switchCaseHelpers'
import { timeUnitsToSeconds } from '../../utils/timeUtils'

export function generateSecureRandomId(): string {
  const cryptoApi = globalThis.crypto
  if (!cryptoApi?.getRandomValues) {
    throw new Error('Cryptographically secure random values are not available in this environment')
  }
  const array = new Uint32Array(2)
  cryptoApi.getRandomValues(array)
  return array[0].toString(36) + array[1].toString(36)
}

function resolveLogicLabel(logicType: string): string {
  if (logicType === ActivityTypeEnum.CONDITION) return 'Conditional'
  if (logicType === ActivityTypeEnum.LOOP) return 'Loop'
  if (logicType === ActivityTypeEnum.SWITCH) return 'Switch'
  if (logicType === ActivityTypeEnum.WAIT) return 'Wait'
  return 'Converge'
}

export function buildLogicStepName(data: LogicFormData): string {
  const name = getNodeDisplayName(
    getDefaultNodeBaseName({
      nodeTypeId: RegistryNodeId.LOGIC,
      initialData: { logicType: data.logicType },
      label: resolveLogicLabel(data.logicType),
    }),
    data.name
  )
  return name
}

export function submitConditionLogic(
  activityId: string,
  name: string,
  data: LogicFormData,
  onError: (msg: string) => void
): boolean {
  if (!data.condition) {
    onError('Conditional expression is required')
    return false
  }
  const activity = createConditionActivity(activityId, name, data.condition)
  useWorkflowStore.getState().addActivity(activity)
  return true
}

export function submitLoopLogic(options: {
  activityId: string
  name: string
  data: LogicFormData
  generateId: () => string
  onSuccess: (id: string) => void
  onError: (msg: string) => void
}): boolean {
  const { activityId, name, data, generateId, onSuccess, onError } = options
  const loopType = data.type === 'forEach' || data.type === 'while' ? data.type : undefined
  if (!loopType) {
    onError('Loop type must be forEach or while')
    return false
  }

  if (loopType === 'forEach' && !data.items) {
    onError('Items expression is required for forEach loop')
    return false
  }
  if (loopType === 'while' && !data.condition) {
    onError('Conditional expression is required for while loop')
    return false
  }

  const activity = createLoopActivity(
    activityId,
    name,
    loopType,
    {
      items: data.items,
      condition: data.condition,
      maxIterations: data.maxIterations,
      indexVariable: data.indexVariable,
      itemVariable: data.itemVariable,
    },
    data.settings
  )

  const genericNodeId = `task_${Date.now()}_${generateId()}`
  const genericName = getNodeDisplayName('Generic Step')
  const genericActivity = createGenericActivity(genericNodeId, genericName, 'Replace this step to complete the loop')

  const currentEdges = useWorkflowStore.getState().edges
  useWorkflowStore.getState().batchAddActivitiesAndEdges({
    activities: [activity, genericActivity],
    edges: [
      ...currentEdges,
      {
        id: `${activityId}-loop-${genericNodeId}`,
        source: activityId,
        target: genericNodeId,
        sourceHandle: EdgeHandleEnum.LOOP,
        targetHandle: EdgeHandleEnum.TARGET,
      },
      {
        id: `${genericNodeId}-${activityId}-end`,
        source: genericNodeId,
        target: activityId,
        sourceHandle: EdgeHandleEnum.SOURCE,
        targetHandle: EdgeHandleEnum.END,
      },
    ],
  })

  onSuccess(activityId)
  return true
}

export function submitConvergeLogic(
  activityId: string,
  name: string,
  data: LogicFormData,
  onError: (msg: string) => void
): boolean {
  if (!data.strategy) {
    onError('Continue when criteria is required')
    return false
  }
  if (data.strategy === 'any') {
    if (data.requiredPathCount === undefined || data.requiredPathCount < 1) {
      onError('Required path count must be at least 1 when using "Any branches reach this step"')
      return false
    }
  }

  const activity = createConvergeActivity(
    activityId,
    name,
    {
      strategy: data.strategy,
      ...(data.strategy === 'any' && { requiredPathCount: data.requiredPathCount }),
      ...(data.wait_duration !== undefined && { wait_duration: data.wait_duration }),
    },
    data.settings
  )

  useWorkflowStore.getState().addActivity(activity)
  return true
}

export function submitSwitchLogic(
  activityId: string,
  name: string,
  data: LogicFormData,
  onError: (msg: string) => void
): boolean {
  if (!data.cases || data.cases.length === 0) {
    onError('At least one path is required')
    return false
  }

  const cases = data.cases.map((c, i) => ({
    port: buildSwitchCasePort(i),
    label: c.label || `Path ${i + 1}`,
    condition: c.condition,
  }))

  const activity = createSwitchActivity(activityId, name, cases)
  useWorkflowStore.getState().addActivity(activity)
  return true
}

export function submitWaitLogic(activityId: string, name: string, data: LogicFormData): boolean {
  const totalSeconds = timeUnitsToSeconds(data.seconds ?? 0, data.minutes ?? 0, data.hours ?? 0, data.days ?? 0)
  const activity = createWaitActivity(activityId, name, { duration: totalSeconds }, data.settings)
  useWorkflowStore.getState().addActivity(activity)
  return true
}
