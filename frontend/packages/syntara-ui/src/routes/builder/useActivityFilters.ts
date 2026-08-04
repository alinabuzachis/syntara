import { useMemo, useState } from 'react'

import type { FilterConfig } from '../../types/filters'
import { FilterOperatorEnum } from '../../types/filters'
import type { ActivityState } from '../workflows/execution/types'

import type { ActivityOrderItem } from './ExecutionActivityTable'

function matchesFilter(activity: ActivityOrderItem, state: ActivityState | undefined, filter: FilterConfig): boolean {
  const { key, operator, value } = filter

  if (key === 'name') {
    const displayName = activity.name ?? activity.id
    if (operator === FilterOperatorEnum.CONTAINS && typeof value === 'string') {
      return displayName.toLowerCase().includes(value.toLowerCase())
    }
    return displayName.toLowerCase().includes(String(value).toLowerCase())
  }

  if (key === 'type') {
    return activity.type === value
  }

  if (key === 'status') {
    return state?.status === value
  }

  return true
}

export function useActivityFilters(activityOrder: ActivityOrderItem[], activityStates: Map<string, ActivityState>) {
  const [filters, setFilters] = useState<FilterConfig[]>([])

  const hasActiveFilters = filters.length > 0

  const filteredActivityOrder = useMemo(() => {
    if (!hasActiveFilters) return activityOrder
    return activityOrder.filter((activity) => {
      const state = activityStates.get(activity.id)
      return filters.every((filter) => matchesFilter(activity, state, filter))
    })
  }, [activityOrder, activityStates, filters, hasActiveFilters])

  const handleFilterChange = (newFilters: FilterConfig[]) => {
    setFilters(newFilters)
  }

  return {
    filters,
    filteredActivityOrder,
    handleFilterChange,
    hasActiveFilters,
  }
}
