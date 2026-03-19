import { CompassPanel, SearchInput, StackItem } from '@patternfly/react-core'
import { Thead, Tbody, Tr, Th, Td } from '@patternfly/react-table'
import { useMemo, useState } from 'react'
import { useSearch } from 'wouter'

import { AppPage } from '../../app/AppPage'
import { AppPageHeader } from '../../app/AppPageHeader'
import { executionsClient, workflowClient } from '../../client'
import { EmptyStateFilter } from '../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../components/EmptyStateNoData'
import { useQueryState } from '../../components/states/useQueryState'
import { DateCell } from '../../components/table/DateCell'
import { LinkCell } from '../../components/table/LinkCell'
import { ScrollableTableContainer } from '../../components/table/ScrollableTableContainer'
import { useFuse } from '../../hooks/useFuse'
import { useTableSort } from '../../hooks/useTableSort'
import { getDateField } from '../../utils/getDateField'
import { StatusLabel } from '../builder/ExecutionStatus'

import { getExecutionSortValue } from './getExecutionSortValue'

// eslint-disable-next-line complexity
export default function Executions() {
  const searchParams = useSearch()
  const urlParams = useMemo(() => new URLSearchParams(searchParams), [searchParams])
  const workflowIdFilter = urlParams.get('workflow_id')
  const [cursor, setCursor] = useState<string | null>(null)

  const executionsQuery = executionsClient.useQuery('get', '/executions', {
    params: {
      query: {
        ...(workflowIdFilter ? { workflow_id: workflowIdFilter } : {}),
        cursor: cursor ?? undefined,
        limit: 20,
        include_total: true,
      },
    },
  })
  const workflowQuery = workflowClient.useQuery(
    'get',
    '/workflows/{workflow_id}',
    {
      params: {
        path: { workflow_id: workflowIdFilter! },
      },
    },
    {
      enabled: !!workflowIdFilter,
    }
  )

  // Fetch all workflows to get names
  const workflowsQuery = workflowClient.useQuery('get', '/workflows', {
    params: {
      query: {
        limit: 100,
      },
    },
  })

  const workflowNameMap = useMemo(() => {
    const workflows = workflowsQuery.data?.resources ?? []
    const map = new Map<string, string>()
    workflows.forEach((workflow) => {
      if (workflow.id && workflow.name) {
        map.set(workflow.id, workflow.name)
      }
    })
    return map
  }, [workflowsQuery.data?.resources])

  // Enrich executions with workflow names for search
  const executionsWithNames = useMemo(() => {
    const executions = executionsQuery.data?.resources ?? []
    return executions.map((execution) => ({
      ...execution,
      workflow_name: execution.workflow_id ? workflowNameMap.get(execution.workflow_id) : undefined,
    }))
  }, [executionsQuery.data?.resources, workflowNameMap])

  const {
    search,
    setSearch,
    items: searchFilteredExecutions,
  } = useFuse(executionsWithNames, [{ name: 'id' }, { name: 'workflow_id' }, { name: 'workflow_name' }])

  const showWorkflowColumn = !workflowIdFilter

  const { activeSortIndex, getSortParams, sortData } = useTableSort({
    initialSortIndex: showWorkflowColumn ? 3 : 2, // Default sort by Created at
    initialDirection: 'desc',
  })

  // Sort the filtered executions
  const filteredExecutions = sortData(searchFilteredExecutions, (execution) =>
    getExecutionSortValue(execution, activeSortIndex, showWorkflowColumn)
  )

  const queryState = useQueryState(executionsQuery, 'Error loading executions')
  if (queryState) {
    return (
      <AppPage>
        <AppPageHeader
          title={
            workflowIdFilter && workflowQuery.data
              ? `Run history for ${(workflowQuery.data as { name?: string }).name ?? 'Workflow'}`
              : 'Automation Runs'
          }
        />
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel isFullHeight>{queryState}</CompassPanel>
        </StackItem>
      </AppPage>
    )
  }

  const pageTitle =
    workflowIdFilter && workflowQuery.data
      ? `Run history for ${(workflowQuery.data as { name?: string }).name ?? 'Workflow'}`
      : 'Automation Runs'

  return (
    <AppPage>
      <AppPageHeader title={pageTitle}>
        <SearchInput
          placeholder="Search executions..."
          value={search}
          onChange={(_event, value) => setSearch(value)}
          onClear={() => setSearch('')}
          style={{ width: '250px' }}
        />
      </AppPageHeader>
      {filteredExecutions.length === 0 ? (
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel isFullHeight>
            {search ? (
              <EmptyStateFilter clearAllFilters={() => setSearch('')} />
            ) : (
              <EmptyStateNoData
                title="No executions found"
                description={workflowIdFilter ? 'No execution history for this workflow.' : 'No executions found.'}
              />
            )}
          </CompassPanel>
        </StackItem>
      ) : (
        <ScrollableTableContainer
          aria-label="Executions table"
          footer={{
            content: (
              <>
                {filteredExecutions.length} {filteredExecutions.length === 1 ? 'execution' : 'executions'}
                {executionsQuery.data?.total != null && executionsQuery.data.total > filteredExecutions.length && (
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
              {showWorkflowColumn && (
                <Th modifier="nowrap" style={{ minWidth: '200px', width: '200px' }} sort={getSortParams(0)}>
                  Automation name
                </Th>
              )}
              <Th
                modifier="nowrap"
                style={{ minWidth: '250px', width: '250px' }}
                sort={getSortParams(showWorkflowColumn ? 1 : 0)}
              >
                Run ID
              </Th>
              <Th sort={getSortParams(showWorkflowColumn ? 2 : 1)}>Status</Th>
              <Th sort={getSortParams(showWorkflowColumn ? 3 : 2)}>Created at</Th>
              <Th sort={getSortParams(showWorkflowColumn ? 4 : 3)}>Completed at</Th>
            </Tr>
          </Thead>
          <Tbody>
            {filteredExecutions.map((execution) => {
              const workflowName = execution.workflow_id ? workflowNameMap.get(execution.workflow_id) : undefined
              return (
                <Tr key={execution.id}>
                  {showWorkflowColumn && (
                    <Td dataLabel="Automation name" modifier="nowrap" style={{ minWidth: '200px', width: '200px' }}>
                      <LinkCell href={`/automation-builder/${execution.workflow_id}`}>
                        {workflowName ?? execution.workflow_id}
                      </LinkCell>
                    </Td>
                  )}
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
      )}
    </AppPage>
  )
}
