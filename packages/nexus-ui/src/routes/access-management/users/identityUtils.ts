import type { UsersAPI } from '@ansible/nexus-contracts'
import { useCallback, useState } from 'react'

import type { FilterConfig } from '../../../types/filters'
import { FilterOperatorEnum } from '../../../types/filters'

export type UserIdentity = UsersAPI.components['schemas']['UserIdentityRead']

export type UserSummary = Pick<
  UsersAPI.components['schemas']['UserRead'],
  'id' | 'username' | 'email' | 'first_name' | 'last_name'
>

export function useLocalFilterState() {
  const [filters, setFilters] = useState<FilterConfig[]>([])
  const clearAllFilters = useCallback(() => setFilters([]), [])
  const setAllFilters = useCallback((f: FilterConfig[]) => setFilters(f), [])
  return { filters, clearAllFilters, setAllFilters }
}

export function applyLocalFilters<T>(
  items: T[],
  filters: FilterConfig[],
  getField: (item: T, key: string) => string
): T[] {
  if (filters.length === 0) return items
  return items.filter((item) =>
    filters.every((f) => {
      const value = getField(item, f.key).toLowerCase()
      const filterValue = String(f.value).toLowerCase()
      if (f.operator === FilterOperatorEnum.CONTAINS) return value.includes(filterValue)
      if (f.operator === FilterOperatorEnum.EQ) return value === filterValue
      return true
    })
  )
}
