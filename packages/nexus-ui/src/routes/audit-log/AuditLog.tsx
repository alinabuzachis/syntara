import { Bullseye, Stack, StackItem } from '@patternfly/react-core'
import { useMemo, useReducer } from 'react'

import { auditClient } from '../../client'
import { EmptyStateFilter } from '../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../components/EmptyStateNoData'
import { FilterBar } from '../../components/filters/FilterBar'
import { NxPage } from '../../components/layout/NxPage'
import { NxPageHeader } from '../../components/layout/NxPageHeader'
import { NxPanel } from '../../components/layout/NxPanel'
import { useQueryState } from '../../components/states/useQueryState'
import { useCursorPagination, useCursorReset } from '../../hooks/useCursorPagination'
import { useTableSort } from '../../hooks/useTableSort'
import { detachPromise } from '../../utils/detachPromise'

import {
  getAuditActorTypeFilterDefinition,
  getAuditCategoryFilterDefinition,
  getAuditDateFilterDefinition,
  getAuditResourceFilterDefinition,
  getAuditSeverityFilterDefinition,
  getAuditStatusFilterDefinition,
  getAuditUsernameFilterDefinition,
} from './auditFilters'
import { AuditLogTable } from './AuditLogTable'

const SORT_COLUMNS = [
  'created_at',
  'event_category',
  'actor_type',
  'actor_username',
  'resource_name',
  'event_status',
  'event_severity',
] as const

type ExpandAction = { type: 'SET_EXPANDED_ROWS'; payload: Set<string> } | { type: 'TOGGLE_ROW'; payload: string }

function expandReducer(state: Set<string>, action: ExpandAction): Set<string> {
  switch (action.type) {
    case 'SET_EXPANDED_ROWS':
      return action.payload
    case 'TOGGLE_ROW': {
      const next = new Set(state)
      if (next.has(action.payload)) {
        next.delete(action.payload)
      } else {
        next.add(action.payload)
      }
      return next
    }
    default:
      return state
  }
}

function buildFilterFieldDefinitions() {
  return [
    getAuditCategoryFilterDefinition(),
    getAuditUsernameFilterDefinition(),
    getAuditActorTypeFilterDefinition(),
    getAuditResourceFilterDefinition(),
    getAuditStatusFilterDefinition(),
    getAuditSeverityFilterDefinition(),
    getAuditDateFilterDefinition(),
  ]
}

export default function AuditLog() {
  const [expandedRows, dispatch] = useReducer(expandReducer, new Set<string>())

  const { activeSortIndex, sortDirection, getSortParams } = useTableSort({
    initialSortIndex: 0,
    initialDirection: 'desc',
  })
  const sortColumn = SORT_COLUMNS[activeSortIndex]
  const sortParam = sortDirection === 'desc' ? `-${sortColumn}` : sortColumn

  const {
    cursor,
    setCursor,
    filters,
    hasActiveFilters,
    queryParams,
    handleFilterChange,
    handleClearAllFilters,
    getFooterProps,
  } = useCursorPagination({
    extraParams: { sort: sortParam },
  })

  const auditQuery = auditClient.useQuery('get', '/audit', {
    params: {
      query: queryParams,
    },
  })

  const events = auditQuery.data?.resources ?? []

  useCursorReset(events.length, hasActiveFilters, cursor, auditQuery.isFetching, () => setCursor(null))

  const filterFieldDefinitions = useMemo(() => buildFilterFieldDefinitions(), [])

  const queryState = useQueryState(auditQuery, {
    title: 'Error loading audit log',
    onRetry: () => detachPromise(auditQuery.refetch()),
  })

  if (queryState) {
    return (
      <NxPage>
        <NxPageHeader title="Audit Log" />
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <NxPanel isFullHeight>{queryState}</NxPanel>
        </StackItem>
      </NxPage>
    )
  }

  const allRowsExpanded = events.length > 0 && events.every((e) => expandedRows.has(e.id ?? ''))

  const onToggleRow = (eventId: string) => {
    dispatch({ type: 'TOGGLE_ROW', payload: eventId })
  }

  const onCollapseAll = (_event: unknown, _rowIndex: number, isOpen: boolean) => {
    dispatch({
      type: 'SET_EXPANDED_ROWS',
      payload: isOpen ? new Set(events.map((e) => e.id ?? '')) : new Set<string>(),
    })
  }

  return (
    <NxPage>
      <NxPageHeader title="Audit Log" />
      <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
        <NxPanel isFullHeight>
          <Stack style={{ height: '100%', padding: '0 var(--pf-t--global--spacer--sm)' }}>
            <FilterBar
              fieldDefinitions={filterFieldDefinitions}
              filters={filters}
              onFilterChange={handleFilterChange}
              showClearAll={true}
            />

            {events.length === 0 ? (
              <StackItem isFilled>
                <Bullseye>
                  {hasActiveFilters ? (
                    <EmptyStateFilter clearAllFilters={handleClearAllFilters} />
                  ) : (
                    <EmptyStateNoData
                      title="No audit events found"
                      description="No audit events have been recorded yet."
                    />
                  )}
                </Bullseye>
              </StackItem>
            ) : (
              <AuditLogTable
                events={events}
                footer={getFooterProps(auditQuery.data)}
                expandedRows={expandedRows}
                onToggleRow={onToggleRow}
                allRowsExpanded={allRowsExpanded}
                onCollapseAll={onCollapseAll}
                getSortParams={getSortParams}
              />
            )}
          </Stack>
        </NxPanel>
      </StackItem>
    </NxPage>
  )
}
