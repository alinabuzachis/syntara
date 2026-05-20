import { useMemo } from 'react'

import { accessClient } from './accessClient'
import type { ResourceActionMap } from './canIUtils'

export function useResourceActions() {
  const { data, isLoading, error, refetch } = accessClient.useQuery('get', '/authz/resource_actions')

  const { resourceTypes, actionsByResource } = useMemo<ResourceActionMap>(() => {
    const ra: Record<string, string[]> = data?.resource_actions ?? {}
    return {
      resourceTypes: Object.keys(ra).sort((a, b) => a.localeCompare(b)),
      actionsByResource: new Map(
        Object.entries(ra)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, [...v].sort((a, b) => a.localeCompare(b))])
      ),
    }
  }, [data])

  return { resourceTypes, actionsByResource, isLoading, error, refetch }
}
