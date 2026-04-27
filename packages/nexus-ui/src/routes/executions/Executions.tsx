import type { Execution } from '@ansible/nexus-contracts'
import { Stack, StackItem } from '@patternfly/react-core'
import { Thead, Tr, Th } from '@patternfly/react-table'
import { useMemo, useState } from 'react'
import { useSearch } from 'wouter'

import { AppPage } from '../../app/AppPage'
import { AppPageHeader } from '../../app/AppPageHeader'
import { executionsClient } from '../../client'
import { AppPanel } from '../../components/AppPanel'
import { EmptyStateFilter } from '../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../components/EmptyStateNoData'
import { FilterBar } from '../../components/filters/FilterBar'
import { PageTitleWithProject } from '../../components/PageTitleWithProject'
import { useQueryState } from '../../components/states/useQueryState'
import { ScrollableTableContainer } from '../../components/table/ScrollableTableContainer'
import { useCursorPagination, useCursorReset } from '../../hooks/useCursorPagination'
import { useProjectSelector } from '../../hooks/useProjectSelector'
import { useTableSort } from '../../hooks/useTableSort'
import type { FilterFieldDefinition } from '../../types/filters'
import { detachPromise } from '../../utils/detachPromise'

import {
  getExecutionWorkflowFilterDefinition,
  getExecutionStatusFilterDefinition,
  getExecutionCreatedAtFilterDefinition,
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

  // Initialize default filter from URL parameter (backwards compatibility)
  const defaultFilters = useMemo(
    () => (workflowIdFilter ? [{ key: 'workflow_id', value: workflowIdFilter }] : []),
    [workflowIdFilter]
  )

  const {
    cursor,
    setCursor,
    filters,
    hasActiveFilters,
    queryParams,
    handleFilterChange,
    handleClearAllFilters,
    getFooterProps,
  } = useCursorPagination({ defaultFilters })

  const executionsQuery = executionsClient.useQuery('get', '/executions', {
    params: {
      query: queryParams,
    },
  })

  const showWorkflowColumn = true
  const allExecutions = useMemo(() => (executionsQuery.data?.resources ?? []) as Execution[], [executionsQuery.data])
  const executions = useMemo(() => {
    if (isAllProjects || !selectedProject) return allExecutions
    return allExecutions.filter((e) => (e as unknown as Record<string, unknown>).project_id === selectedProject.id)
  }, [allExecutions, isAllProjects, selectedProject])

  useCursorReset(executions.length, hasActiveFilters, cursor, executionsQuery.isFetching, setCursor)

  const filterFieldDefinitions = useMemo(() => buildFilterFieldDefinitions(), [])

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
    const groups = new Map<string, { project: (typeof projects)[number] | null; executions: Execution[] }>()
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
    onRetry: () => detachPromise(executionsQuery.refetch()),
  })
  if (queryState) {
    return (
      <AppPage>
        <AppPageHeader title={<PageTitleWithProject title="Workflow Runs" projectSelector={ProjectSelector} />} />
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <AppPanel isFullHeight>{queryState}</AppPanel>
        </StackItem>
      </AppPage>
    )
  }

  return (
    <AppPage>
      <AppPageHeader title={<PageTitleWithProject title="Workflow Runs" projectSelector={ProjectSelector} />} />
      <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
        <AppPanel isFullHeight>
          <Stack style={{ height: '100%', flex: 1, minHeight: 0, padding: '0 var(--pf-t--global--spacer--sm)' }}>
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
                {hasActiveFilters ? (
                  <EmptyStateFilter clearAllFilters={handleClearAllFilters} />
                ) : (
                  <EmptyStateNoData title="No executions found" description="No executions found." />
                )}
              </StackItem>
            ) : (
              <ScrollableTableContainer
                aria-label="Executions table"
                footer={getFooterProps(executionsQuery.data, sortedExecutions.length, 'execution', 'executions')}
              >
                <Thead>
                  <Tr>
                    <Th modifier="nowrap" style={{ minWidth: '200px', width: '200px' }} sort={getSortParams(0)}>
                      Workflow name
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
        </AppPanel>
      </StackItem>
    </AppPage>
  )
}
