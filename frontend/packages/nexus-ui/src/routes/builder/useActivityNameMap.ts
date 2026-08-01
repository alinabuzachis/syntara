import { useMemo } from 'react'

import { useActivities, useTriggers } from '../../stores/workflowStoreSelectors'
import type { ActivityState } from '../workflows/execution/types'
import { parseCompositeKey } from '../workflows/execution/utils/activityState'

import type { ActivityOrderItem } from './ExecutionActivityTable'

type ActivityLike = {
  id?: string
  name?: string | null
  type?: string
  branches?: (ActivityLike[] | ActivityLike | string)[]
  steps?: ActivityLike[]
  then?: ActivityLike[]
  else?: ActivityLike[]
  loop?: { do?: ActivityLike[] }
  converge?: { branches?: string[] }
}

export type WorkflowDefShape = {
  workflow?: { activities?: ActivityLike[] }
  /** v2 format stores nodes at top level */
  nodes?: ActivityLike[]
}

const CHILD_KEYS: (keyof ActivityLike)[] = ['steps', 'then', 'else']

function normalizeBranches(branches: (ActivityLike[] | ActivityLike | string)[]): ActivityLike[][] {
  return branches
    .filter((b): b is ActivityLike[] | ActivityLike => typeof b !== 'string')
    .map((b) => (Array.isArray(b) ? b : [b]))
}

function collectNamesFromActivityList(
  acts: ActivityLike[],
  nameMap: Map<string, string>,
  typeMap: Map<string, string>
): void {
  for (const act of acts) {
    collectNamesFromActivity(act, nameMap, typeMap)
  }
}

function collectNamesFromActivity(act: ActivityLike, nameMap: Map<string, string>, typeMap: Map<string, string>): void {
  if (act.id && act.name) nameMap.set(act.id, act.name)
  if (act.id && act.type) typeMap.set(act.id, act.type)

  if (act.branches) {
    for (const branch of normalizeBranches(act.branches)) {
      collectNamesFromActivityList(branch, nameMap, typeMap)
    }
  }

  for (const key of CHILD_KEYS) {
    const children = act[key]
    if (Array.isArray(children)) {
      collectNamesFromActivityList(children as ActivityLike[], nameMap, typeMap)
    }
  }

  if (act.loop?.do) {
    collectNamesFromActivityList(act.loop.do, nameMap, typeMap)
  }
}

function buildNameMap(activities: ActivityLike[] | undefined): {
  nameMap: Map<string, string>
  typeMap: Map<string, string>
} {
  const nameMap = new Map<string, string>()
  const typeMap = new Map<string, string>()
  if (!activities) return { nameMap, typeMap }
  collectNamesFromActivityList(activities, nameMap, typeMap)
  return { nameMap, typeMap }
}

function buildStoreNameMap(
  activities: Array<{ id?: string; name?: string; type?: string }>,
  triggers: Array<{ id?: string; name?: string; type?: string }>
): { nameMap: Map<string, string>; typeMap: Map<string, string> } {
  const nameMap = new Map<string, string>()
  const typeMap = new Map<string, string>()
  for (const act of activities) {
    if (act.id && act.name) nameMap.set(act.id, act.name)
    if (act.id && act.type) typeMap.set(act.id, act.type)
  }
  for (const trigger of triggers) {
    if (trigger.id && trigger.name) nameMap.set(trigger.id, trigger.name)
    if (trigger.id && trigger.type) typeMap.set(trigger.id, trigger.type)
  }
  return { nameMap, typeMap }
}

function buildDefinitionNameMap(def: WorkflowDefShape | null | undefined): {
  nameMap: Map<string, string>
  typeMap: Map<string, string>
} {
  const fromActivities = buildNameMap(def?.workflow?.activities)
  const fromNodes = buildNameMap(def?.nodes)
  if (fromNodes.nameMap.size === 0) return fromActivities
  const mergedNames = new Map(fromActivities.nameMap)
  const mergedTypes = new Map(fromActivities.typeMap)
  for (const [id, name] of fromNodes.nameMap) {
    mergedNames.set(id, name)
  }
  for (const [id, type] of fromNodes.typeMap) {
    mergedTypes.set(id, type)
  }
  return { nameMap: mergedNames, typeMap: mergedTypes }
}

export function useActivityNameMap(
  workflowDefinition: WorkflowDefShape | null | undefined,
  activityStates: Map<string, ActivityState>
) {
  const storeActivities = useActivities()
  const storeTriggers = useTriggers()

  const { nameMap, typeMap } = useMemo(() => {
    const hasStoreData = (storeActivities && storeActivities.length > 0) || (storeTriggers && storeTriggers.length > 0)
    if (hasStoreData) {
      return buildStoreNameMap(storeActivities ?? [], storeTriggers ?? [])
    }
    return buildDefinitionNameMap(workflowDefinition)
  }, [storeActivities, storeTriggers, workflowDefinition])

  const activityOrder = useMemo<ActivityOrderItem[]>(
    () =>
      Array.from(activityStates.keys()).map((id) => {
        const { baseId, iteration } = parseCompositeKey(id)
        const baseName = nameMap.get(baseId)
        const effectiveIteration = iteration ?? activityStates.get(id)?.iteration
        let name: string | undefined
        if (effectiveIteration != null && baseName) {
          name = `${baseName} (Iteration ${effectiveIteration + 1})`
        } else {
          name = nameMap.get(id)
        }
        return { id, name, type: typeMap.get(baseId) ?? typeMap.get(id) }
      }),
    [activityStates, nameMap, typeMap]
  )

  return { nameMap, activityOrder }
}

export function resolveNodeName(nameMap: Map<string, string>, nodeId?: string | null): string | undefined {
  if (!nodeId) return undefined
  return nameMap.get(nodeId) ?? nodeId
}
