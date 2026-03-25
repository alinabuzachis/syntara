import { CompassPanel, Stack, StackItem } from '@patternfly/react-core'
import { Thead, Tbody, Tr, Th, Td } from '@patternfly/react-table'
import { useMemo, useState } from 'react'
import { useSearch } from 'wouter'

import { AppPage } from '../../app/AppPage'
import { AppPageHeader } from '../../app/AppPageHeader'
import { executionsClient } from '../../client'
import { EmptyStateFilter } from '../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../components/EmptyStateNoData'
import { FilterBar } from '../../components/filters/FilterBar'
import { useQueryState } from '../../components/states/useQueryState'
import { DateCell } from '../../components/table/DateCell'
import { LinkCell } from '../../components/table/LinkCell'
import { ScrollableTableContainer } from '../../components/table/ScrollableTableContainer'
import { WorkflowName } from '../../components/WorkflowName'
import { useFilterState } from '../../hooks/useFilterState'
import { useTableSort } from '../../hooks/useTableSort'
import type { FilterFieldDefinition } from '../../types/filters'
import { buildFilterParams } from '../../utils/filterUtils'
import { getDateField } from '../../utils/getDateField'
import { StatusLabel } from '../builder/ExecutionStatus'

import {
  getExecutionWorkflowFilterDefinition,
  getExecutionStatusFilterDefinition,
  getExecutionCreatedAtFilterDefinition,
  createFilterChangeHandler,
} from './executionFilters'
import { getExecutionSortValue } from './getExecutionSortValue'

/**
 * Build filter field definitions for the executions page
 */
function buildFilterFieldDefinitions(): FilterFieldDefinition[] {
  return [
    getExecutionWorkflowFilterDefinition(),
    getExecutionStatusFilterDefinition(),
    getExecutionCreatedAtFilterDefinition(),
  ].filter((def): def is FilterFieldDefinition => def !== null)
}

export default function Executions() {
  const searchParams = useSearch()
  const urlParams = useMemo(() => new URLSearchParams(searchParams), [searchParams])
  const workflowIdFilter = urlParams.get('workflow_id')
  const [cursor, setCursor] = useState<string | null>(null)

  // Initialize default filter from URL parameter (backwards compatibility)
  const defaultFilters = useMemo(
    () => (workflowIdFilter ? [{ key: 'workflow_id', value: workflowIdFilter }] : []),
    [workflowIdFilter]
  )

  // Filter state management
  const { filters, clearAllFilters, setAllFilters } = useFilterState(defaultFilters)

  // Build query parameters from filters
  const queryParams = useMemo(() => {
    const params: Record<string, unknown> = {
      limit: 20,
      include_total: true,
    }

    // Add filter params
    const filterParams = buildFilterParams(filters)
    Object.assign(params, filterParams)

    // Add cursor if present
    if (cursor) {
      params.cursor = cursor
    }

    return params
  }, [filters, cursor])

  const executionsQuery = executionsClient.useQuery('get', '/executions', {
    params: {
      query: queryParams,
    },
  })

  const showWorkflowColumn = true
  const executions = executionsQuery.data?.resources ?? []

  // Define filter field definitions for FilterBar
  const filterFieldDefinitions = useMemo(() => buildFilterFieldDefinitions(), [])

  // Handle filter changes from FilterBar
  const handleFilterChange = createFilterChangeHandler(cursor, () => setCursor(null), clearAllFilters, setAllFilters)

  // Handler for "Clear all filters" button in EmptyStateFilter
  const handleClearAllFilters = () => handleFilterChange([])

  const hasActiveFilters = filters.length > 0

  const { activeSortIndex, getSortParams, sortData } = useTableSort({
    initialSortIndex: 3, // Default sort by Created at
    initialDirection: 'desc',
  })

  // Sort the executions (client-side sorting of current page)
  const sortedExecutions = sortData(executions, (execution) =>
    getExecutionSortValue(execution, activeSortIndex, showWorkflowColumn)
  )

  const queryState = useQueryState(executionsQuery, 'Error loading executions')
  if (queryState) {
    return (
      <AppPage>
        <AppPageHeader title="Automation Runs" />
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel isFullHeight>{queryState}</CompassPanel>
        </StackItem>
      </AppPage>
    )
  }

  return (
    <AppPage>
      <AppPageHeader title="Automation Runs" />

      {sortedExecutions.length === 0 && !hasActiveFilters ? (
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel isFullHeight>
            <EmptyStateNoData title="No executions found" description="No executions found." />
          </CompassPanel>
        </StackItem>
      ) : (
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel isFullHeight>
            <Stack style={{ height: '100%' }}>
              <StackItem>
                <FilterBar
                  fieldDefinitions={filterFieldDefinitions}
                  filters={filters}
                  onFilterChange={handleFilterChange}
                  showClearAll={true}
                />
              </StackItem>

              {sortedExecutions.length === 0 ? (
                <StackItem isFilled style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <EmptyStateFilter clearAllFilters={handleClearAllFilters} />
                </StackItem>
              ) : (
                <StackItem isFilled style={{ minHeight: 0, overflow: 'auto' }}>
                  <ScrollableTableContainer
                    aria-label="Executions table"
                    footer={{
                      content: (
                        <>
                          {sortedExecutions.length} {sortedExecutions.length === 1 ? 'execution' : 'executions'}
                          {executionsQuery.data?.total != null &&
                            executionsQuery.data.total > sortedExecutions.length && (
                              <span style={{ opacity: 0.6 }}> (of {executionsQuery.data.total} total)</span>
                            )}
                        </>
                      ),
                      prev: executionsQuery.data?.prev ?? null,
                      next: executionsQuery.data?.next ?? null,
                      onPrev: () => setCursor(executionsQuery.data?.prev ?? null),
                      onNext: () => setCursor(executionsQuery.data?.next ?? null),
                    }}
                  >
                    <Thead>
                      <Tr>
                        <Th modifier="nowrap" style={{ minWidth: '200px', width: '200px' }} sort={getSortParams(0)}>
                          Automation name
                        </Th>
                        <Th modifier="nowrap" style={{ minWidth: '250px', width: '250px' }} sort={getSortParams(1)}>
                          Run ID
                        </Th>
                        <Th sort={getSortParams(2)}>Status</Th>
                        <Th sort={getSortParams(3)}>Created at</Th>
                        <Th sort={getSortParams(4)}>Completed at</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {sortedExecutions.map((execution) => {
                        return (
                          <Tr key={execution.id}>
                            <Td
                              dataLabel="Automation name"
                              modifier="nowrap"
                              style={{ minWidth: '200px', width: '200px' }}
                            >
                              <LinkCell href={`/automation-builder/${execution.workflow_id}`}>
                                {execution.workflow_id && <WorkflowName workflowId={execution.workflow_id} />}
                              </LinkCell>
                            </Td>
                            <Td dataLabel="Run ID" modifier="nowrap" style={{ minWidth: '250px', width: '250px' }}>
                              <LinkCell href={`/executions/${execution.id}`}>
                                <code style={{ fontSize: 'var(--pf-t--global--font-size--sm)' }}>{execution.id}</code>
                              </LinkCell>
                            </Td>
                            <Td dataLabel="Status">{execution.status && <StatusLabel status={execution.status} />}</Td>
                            <Td dataLabel="Created at">
                              <DateCell dateString={getDateField(execution, 'createdAt')} />
                            </Td>
                            <Td dataLabel="Completed at">
                              {execution.completed_at ? (
                                <DateCell dateString={execution.completed_at} />
                              ) : (
                                <span style={{ color: 'var(--pf-t--global--color--text--secondary)' }}>—</span>
                              )}
                            </Td>
                          </Tr>
                        )
                      })}
                    </Tbody>
                  </ScrollableTableContainer>
                </StackItem>
              )}
            </Stack>
          </CompassPanel>
        </StackItem>
      )}
    </AppPage>
  )
}
