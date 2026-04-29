import { useMemo } from 'react'

import { useActivities, useTriggers } from '../../stores/workflowStoreSelectors'
import type { ActivityState } from '../workflows/execution/types'

import type { ActivityOrderItem } from './ExecutionActivityTable'

type ActivityLike = {
  id?: string
  name?: string
  branches?: (ActivityLike[] | ActivityLike | string)[]
  steps?: ActivityLike[]
  then?: ActivityLike[]
  else?: ActivityLike[]
  loop?: { do?: ActivityLike[] }
  converge?: { branches?: string[] }
}

export type WorkflowDefShape = {
  workflow?: { activities?: ActivityLike[] }
}

const CHILD_KEYS: (keyof ActivityLike)[] = ['steps', 'then', 'else']

function normalizeBranches(branches: (ActivityLike[] | ActivityLike | string)[]): ActivityLike[][] {
  return branches
    .filter((b): b is ActivityLike[] | ActivityLike => typeof b !== 'string')
    .map((b) => (Array.isArray(b) ? b : [b]))
}

function collectNamesFromActivityList(acts: ActivityLike[], map: Map<string, string>): void {
  for (const act of acts) {
    collectNamesFromActivity(act, map)
  }
}

function collectNamesFromActivity(act: ActivityLike, map: Map<string, string>): void {
  if (act.id && act.name) map.set(act.id, act.name)

  if (act.branches) {
    for (const branch of normalizeBranches(act.branches)) {
      collectNamesFromActivityList(branch, map)
    }
  }

  for (const key of CHILD_KEYS) {
    const children = act[key]
    if (Array.isArray(children)) {
      collectNamesFromActivityList(children as ActivityLike[], map)
    }
  }

  if (act.loop?.do) {
    collectNamesFromActivityList(act.loop.do, map)
  }
}

function buildNameMap(activities: ActivityLike[] | undefined): Map<string, string> {
  const map = new Map<string, string>()
  if (!activities) return map
  collectNamesFromActivityList(activities, map)
  return map
}

export function useActivityNameMap(
  workflowDefinition: WorkflowDefShape | null | undefined,
  activityStates: Map<string, ActivityState>
) {
  const storeActivities = useActivities()
  const storeTriggers = useTriggers()

  const nameMap = useMemo(() => {
    if ((storeActivities && storeActivities.length > 0) || (storeTriggers && storeTriggers.length > 0)) {
      const map = new Map<string, string>()
      for (const act of storeActivities ?? []) {
        if (act.id && act.name) map.set(act.id, act.name)
      }
      for (const trigger of storeTriggers ?? []) {
        if (trigger.id && trigger.name) map.set(trigger.id, trigger.name)
      }
      return map
    }
    return buildNameMap(workflowDefinition?.workflow?.activities)
  }, [storeActivities, storeTriggers, workflowDefinition?.workflow?.activities])

  const activityOrder = useMemo<ActivityOrderItem[]>(
    () => Array.from(activityStates.keys()).map((id) => ({ id, name: nameMap.get(id) })),
    [activityStates, nameMap]
  )

  return { nameMap, activityOrder }
}

export function resolveNodeName(nameMap: Map<string, string>, nodeId?: string | null): string | undefined {
  if (!nodeId) return undefined
  return nameMap.get(nodeId) ?? nodeId
}
