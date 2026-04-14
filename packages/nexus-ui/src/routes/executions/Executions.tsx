import { CompassPanel, Stack, StackItem } from '@patternfly/react-core'
import { Thead, Tr, Th } from '@patternfly/react-table'
import { useMemo, useState } from 'react'
import { useSearch } from 'wouter'

import { AppPage } from '../../app/AppPage'
import { AppPageHeader } from '../../app/AppPageHeader'
import { executionsClient } from '../../client'
import { EmptyStateFilter } from '../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../components/EmptyStateNoData'
import { FilterBar } from '../../components/filters/FilterBar'
import { PageTitleWithProject } from '../../components/PageTitleWithProject'
import { useQueryState } from '../../components/states/useQueryState'
import { ScrollableTableContainer } from '../../components/table/ScrollableTableContainer'
import { useFilterState } from '../../hooks/useFilterState'
import { useProjectSelector } from '../../hooks/useProjectSelector'
import { useTableSort } from '../../hooks/useTableSort'
import type { FilterFieldDefinition } from '../../types/filters'
import { buildFilterParams } from '../../utils/filterUtils'

import {
  getExecutionWorkflowFilterDefinition,
  getExecutionStatusFilterDefinition,
  getExecutionCreatedAtFilterDefinition,
  createFilterChangeHandler,
} from './executionFilters'
import { FlatExecutionsTableBody, GroupedExecutionsTableBody } from './ExecutionsTableBody'
import { getExecutionSortValue } from './getExecutionSortValue'

function buildFilterFieldDefinitions(): FilterFieldDefinition[] {
  return [
    getExecutionWorkflowFilterDefinition(),
    getExecutionStatusFilterDefinition(),
    getExecutionCreatedAtFilterDefinition(),
  ].filter((def): def is FilterFieldDefinition => def !== null)
}

export default function Executions() {
  const { selectedProject, isAllProjects, projects, ProjectSelector } = useProjectSelector()
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

    // Filter by selected project
    if (selectedProject?.id) {
      params.project_id = selectedProject.id
    }

    const filterParams = buildFilterParams(filters)
    Object.assign(params, filterParams)

    if (cursor) {
      params.cursor = cursor
    }

    return params
  }, [filters, cursor, selectedProject])

  const executionsQuery = executionsClient.useQuery('get', '/executions', {
    params: {
      query: queryParams,
    },
  })

  const showWorkflowColumn = true
  const executions = executionsQuery.data?.resources ?? []

  const filterFieldDefinitions = useMemo(() => buildFilterFieldDefinitions(), [])

  const handleFilterChange = createFilterChangeHandler(cursor, () => setCursor(null), clearAllFilters, setAllFilters)

  const handleClearAllFilters = () => handleFilterChange([])

  const hasActiveFilters = filters.length > 0

  const { activeSortIndex, getSortParams, sortData } = useTableSort({
    initialSortIndex: 3, // Default sort by Created at
    initialDirection: 'desc',
  })

  const sortedExecutions = sortData(executions, (execution) =>
    getExecutionSortValue(execution, activeSortIndex, showWorkflowColumn)
  )

  // Group executions by project when viewing all projects
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set())

  const groupedExecutions = useMemo(() => {
    if (!isAllProjects) return null
    const groups = new Map<string, { project: (typeof projects)[number] | null; executions: typeof sortedExecutions }>()
    for (const execution of sortedExecutions) {
      const projectId = ((execution as Record<string, unknown>).project_id as string | undefined) ?? 'unknown'
      if (!groups.has(projectId)) {
        groups.set(projectId, {
          project: projects.find((p) => p.id === projectId) ?? null,
          executions: [],
        })
      }
      groups.get(projectId)!.executions.push(execution)
    }
    return groups
  }, [sortedExecutions, projects, isAllProjects])

  const toggleProjectCollapsed = (projectId: string) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) {
        next.delete(projectId)
      } else {
        next.add(projectId)
      }
      return next
    })
  }

  const queryState = useQueryState(executionsQuery, {
    title: 'Error loading executions',
    onRetry: () => {
      executionsQuery.refetch().catch(() => {})
    },
  })
  if (queryState) {
    return (
      <AppPage>
        <AppPageHeader title={<PageTitleWithProject title="Automation Runs" projectSelector={ProjectSelector} />} />
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel isFullHeight>{queryState}</CompassPanel>
        </StackItem>
      </AppPage>
    )
  }

  return (
    <AppPage>
      <AppPageHeader title={<PageTitleWithProject title="Automation Runs" projectSelector={ProjectSelector} />} />
      <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
        <CompassPanel isFullHeight>
          <Stack style={{ height: '100%', padding: '0 var(--pf-t--global--spacer--sm)' }}>
            <FilterBar
              fieldDefinitions={filterFieldDefinitions}
              filters={filters}
              onFilterChange={handleFilterChange}
              showClearAll={true}
            />

            {sortedExecutions.length === 0 ? (
              <StackItem isFilled style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {hasActiveFilters ? (
                  <EmptyStateFilter clearAllFilters={handleClearAllFilters} />
                ) : (
                  <EmptyStateNoData title="No executions found" description="No executions found." />
                )}
              </StackItem>
            ) : (
              <ScrollableTableContainer
                aria-label="Executions table"
                footer={{
                  content: (
                    <>
                      {sortedExecutions.length} {sortedExecutions.length === 1 ? 'execution' : 'executions'}
                      {executionsQuery.data?.total != null && executionsQuery.data.total > sortedExecutions.length && (
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
                {isAllProjects && groupedExecutions ? (
                  <GroupedExecutionsTableBody
                    groupedExecutions={groupedExecutions}
                    collapsedProjects={collapsedProjects}
                    onToggleProject={toggleProjectCollapsed}
                  />
                ) : (
                  <FlatExecutionsTableBody executions={sortedExecutions} />
                )}
              </ScrollableTableContainer>
            )}
          </Stack>
        </CompassPanel>
      </StackItem>
    </AppPage>
  )
}
