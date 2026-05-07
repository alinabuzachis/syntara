import type { Execution } from '@ansible/nexus-contracts'
import { StackItem } from '@patternfly/react-core'
import { Thead, Tr, Th } from '@patternfly/react-table'
import { useMemo, useState } from 'react'
import { useSearch } from 'wouter'

import { AppPage, AppPageMain } from '../../app/AppPage'
import { AppPageHeader } from '../../app/AppPageHeader'
import { executionsClient } from '../../client'
import { AppPanel } from '../../components/AppPanel'
import { EmptyStateFilter } from '../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../components/EmptyStateNoData'
import { FilterBar } from '../../components/filters/FilterBar'
import { PageTitleWithProject } from '../../components/PageTitleWithProject'
import { PanelContentStack } from '../../components/PanelContentStack'
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

  const selectedProjectId = selectedProject?.id ?? null
  const projectExtraParams = useMemo(
    () => (selectedProjectId ? { project_id: selectedProjectId } : undefined),
    [selectedProjectId]
  )

  const {
    cursor,
    resetPagination,
    filters,
    hasActiveFilters,
    queryParams,
    handleFilterChange,
    handleClearAllFilters,
    getFooterProps,
  } = useCursorPagination({ defaultFilters, extraParams: projectExtraParams })

  const executionsQuery = executionsClient.useQuery('get', '/executions', {
    params: {
      query: queryParams,
    },
  })

  const showWorkflowColumn = true
  const executions = useMemo(() => (executionsQuery.data?.resources ?? []) as Execution[], [executionsQuery.data])

  useCursorReset(executions.length, hasActiveFilters, cursor, executionsQuery.isFetching, resetPagination)

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
        <AppPageMain>
          <AppPanel isFullHeight>{queryState}</AppPanel>
        </AppPageMain>
      </AppPage>
    )
  }

  return (
    <AppPage>
      <AppPageHeader title={<PageTitleWithProject title="Workflow Runs" projectSelector={ProjectSelector} />} />
      <AppPageMain>
        <AppPanel isFullHeight>
          <PanelContentStack variant="pageGutter">
            <StackItem>
              <FilterBar
                fieldDefinitions={filterFieldDefinitions}
                filters={filters}
                onFilterChange={handleFilterChange}
                showClearAll={true}
              />
            </StackItem>

            {sortedExecutions.length === 0 ? (
              <AppPageMain isCentered>
                {hasActiveFilters ? (
                  <EmptyStateFilter clearAllFilters={handleClearAllFilters} />
                ) : (
                  <EmptyStateNoData title="No executions found" description="No executions found." />
                )}
              </AppPageMain>
            ) : (
              <ScrollableTableContainer aria-label="Executions table" footer={getFooterProps(executionsQuery.data)}>
                <Thead>
                  <Tr>
                    <Th modifier="nowrap" sort={getSortParams(0)}>
                      Workflow name
                    </Th>
                    <Th modifier="nowrap" sort={getSortParams(1)}>
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
          </PanelContentStack>
        </AppPanel>
      </AppPageMain>
    </AppPage>
  )
}
