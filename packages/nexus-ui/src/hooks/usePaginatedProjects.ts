import { useCallback, useMemo, useState } from 'react'

import { accessClient } from '../routes/access/accessClient'
import type { ProjectRead } from '../routes/access/types'

import { useDebouncedValue } from './useDebouncedValue'

const PAGE_SIZE = 20

export function usePaginatedProjects() {
  const [filterValue, setFilterValue] = useState('')
  const [cursor, setCursor] = useState<string | null>(null)
  const [extraPages, setExtraPages] = useState<ProjectRead[]>([])

  const debouncedFilter = useDebouncedValue(filterValue)

  const updateFilter = (val: string) => {
    setFilterValue(val)
    setCursor(null)
    setExtraPages([])
  }

  const resetPagination = () => {
    setFilterValue('')
    setCursor(null)
    setExtraPages([])
  }

  const query = accessClient.useQuery('get', '/projects', {
    params: {
      query: {
        limit: PAGE_SIZE,
        ...(debouncedFilter ? { name: debouncedFilter } : {}),
        ...(cursor ? { cursor } : {}),
      },
    },
  })

  const firstPageProjects = useMemo(() => query.data?.resources ?? [], [query.data])

  const projects = useMemo(() => {
    if (extraPages.length === 0) return firstPageProjects
    const allItems = [...extraPages, ...firstPageProjects]
    const seen = new Set<string | undefined>()
    return allItems.filter((p) => {
      if (seen.has(p.id)) return false
      seen.add(p.id)
      return true
    })
  }, [firstPageProjects, extraPages])

  const hasMore = !!query.data?.next
  const isLoadingMore = !!cursor && query.isFetching
  const isInitialPage = !cursor && !debouncedFilter

  const loadMore = useCallback(() => {
    const nextCursor = query.data?.next
    if (nextCursor) {
      setExtraPages(projects)
      setCursor(nextCursor)
    }
  }, [query.data?.next, projects])

  return {
    projects,
    filterValue,
    debouncedFilter,
    updateFilter,
    resetPagination,
    hasMore,
    isLoadingMore,
    isInitialPage,
    loadMore,
    query,
  }
}
