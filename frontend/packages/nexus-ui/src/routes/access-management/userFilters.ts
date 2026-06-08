import { authFetchClient } from '../../client'
import type { FilterFieldDefinition } from '../../types/filters'
import { FilterOperatorEnum, FilterTypeEnum } from '../../types/filters'

import { AUTH_SOURCE_LOCAL } from './adminConstants'

// Re-export shared filter change handler
export { createFilterChangeHandler } from '../../hooks/useFilterChangeHandler'

/**
 * Filter field definition for username filtering
 */
export const getUsernameFilterDefinition = (): FilterFieldDefinition => ({
  key: 'username',
  label: 'Username',
  type: FilterTypeEnum.TEXT,
  operators: [FilterOperatorEnum.CONTAINS],
  defaultOperator: FilterOperatorEnum.CONTAINS,
  placeholder: 'Filter by username',
})

export function getAuthSourceFilterDefinition(): FilterFieldDefinition {
  return {
    key: 'auth_source',
    label: 'Authentication',
    type: FilterTypeEnum.SELECT,
    asyncOptions: async () => {
      const staticOptions = [{ value: AUTH_SOURCE_LOCAL, label: AUTH_SOURCE_LOCAL }]
      try {
        const response = await authFetchClient.GET('/auth/providers')
        const providers = response.data?.providers ?? []
        const providerOptions = providers.map((p) => ({ value: p.name, label: p.name }))
        return [...staticOptions, ...providerOptions]
      } catch {
        return staticOptions
      }
    },
    placeholder: 'Filter by authentication',
  }
}
