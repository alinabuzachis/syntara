import { useCallback, useMemo, useState } from 'react'

import { usersClient } from '../../../client'
import type { PaginationFooterProps } from '../../../components/table/PaginationFooter'
import { useTableSort } from '../../../hooks/useTableSort'
import { buildFilterParams } from '../../../utils/filterUtils'

import { applyLocalFilters, useLocalFilterState } from './identityUtils'

export function useUsersPagination(targetUserId: string) {
  const [cursorHistory, setCursorHistory] = useState<string[]>([])
  const [perPage, setPerPage] = useState(20)
  const handlePerPageChange = useCallback((newPerPage: number) => {
    setPerPage(newPerPage)
    setCursorHistory([])
  }, [])
  const usersCursor = cursorHistory.length > 0 ? cursorHistory[cursorHistory.length - 1] : null

  const usersFilter = useLocalFilterState()
  const usersSort = useTableSort({ initialSortIndex: 0, initialDirection: 'asc' })

  const usersQueryParams = useMemo(() => {
    const params: Record<string, unknown> = { limit: perPage, include_total: true }
    Object.assign(params, buildFilterParams(usersFilter.filters))
    if (usersCursor) params.cursor = usersCursor
    return params
  }, [usersFilter.filters, usersCursor, perPage])

  const usersQuery = usersClient.useQuery('get', '/users', { params: { query: usersQueryParams } })

  const usersData = usersQuery.data
  const sortedUsers = useMemo(() => {
    const otherUsers = (usersData?.resources ?? []).filter((u) => u.id !== targetUserId && !u.is_builtin)
    return usersSort.sortData(otherUsers, (user) => (usersSort.activeSortIndex === 1 ? user.email : user.username))
  }, [usersData, targetUserId, usersSort])
  const usersNext = usersData?.next ?? null
  const footerProps: PaginationFooterProps = {
    page: cursorHistory.length + 1,
    perPage,
    total: usersData?.total ?? null,
    hasNext: !!usersNext,
    onPrev: () => setCursorHistory((h) => h.slice(0, -1)),
    onNext: () => {
      if (usersNext) setCursorHistory((h) => [...h, usersNext])
    },
    onPerPageChange: handlePerPageChange,
  }

  const resetPage = () => setCursorHistory([])

  return { sortedUsers, usersFilter, usersSort, footerProps, resetPage, usersQuery }
}

export function useIdentitiesData(selectedUserId: string | undefined) {
  const identitiesFilter = useLocalFilterState()
  const identitiesSort = useTableSort({ initialSortIndex: 0, initialDirection: 'asc' })

  const userIdentitiesQuery = usersClient.useQuery(
    'get',
    '/users/{user_id}/identities',
    { params: { path: { user_id: selectedUserId ?? '' } } },
    { enabled: !!selectedUserId }
  )

  const identitiesData = userIdentitiesQuery.data
  const sortedIdentities = useMemo(() => {
    const userIdentities = identitiesData?.resources ?? []
    const filteredIdentities = applyLocalFilters(userIdentities, identitiesFilter.filters, (i, key) =>
      key === 'provider_name' ? (i.provider_name ?? '') : ''
    )
    return identitiesSort.sortData(filteredIdentities, (i) => {
      switch (identitiesSort.activeSortIndex) {
        case 1:
          return i.subject
        case 2:
          return i.created_at
        default:
          return i.provider_name
      }
    })
  }, [identitiesData, identitiesFilter.filters, identitiesSort])

  return { sortedIdentities, identitiesFilter, identitiesSort, userIdentitiesQuery }
}
