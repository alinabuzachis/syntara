import { CompassPanel, SearchInput, StackItem } from '@patternfly/react-core'
import { Thead, Tbody, Tr, Th, Td } from '@patternfly/react-table'
import { useMemo, useState } from 'react'
import { useSearch } from 'wouter'

import { AppPage } from '../../app/AppPage'
import { AppPageHeader } from '../../app/AppPageHeader'
import { workflowClient } from '../../client'
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

export default function Executions() {
  const searchParams = useSearch()
  const urlParams = useMemo(() => new URLSearchParams(searchParams), [searchParams])
  const workflowIdFilter = urlParams.get('workflow_id')
  const [cursor, setCursor] = useState<string | null>(null)

  const executionsQuery = workflowClient.useQuery('get', '/executions', {
    params: {
      query: {
        ...(workflowIdFilter ? { workflow_id: workflowIdFilter } : {}),
        cursor: cursor ?? undefined,
        limit: 20,
        include_total: true,
      },
    },
  })
  const executions = executionsQuery.data?.resources ?? []

  const workflowQuery = workflowClient.useQuery(
    'get',
    '/workflows/{workflowId}',
    {
      params: {
        path: { workflowId: workflowIdFilter! },
      },
    },
    {
      enabled: !!workflowIdFilter,
    }
  )

  const { search, setSearch, items: searchFilteredExecutions } = useFuse(executions, [{ name: 'workflow_id' }])

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
          title={workflowIdFilter && workflowQuery.data ? `Run history for ${workflowQuery.data?.name}` : 'Run history'}
        />
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel isFullHeight>{queryState}</CompassPanel>
        </StackItem>
      </AppPage>
    )
  }

  const pageTitle =
    workflowIdFilter && workflowQuery.data ? `Run history for ${workflowQuery.data.name}` : 'Run history'

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
              <Th modifier="nowrap" style={{ minWidth: '250px', width: '250px' }} sort={getSortParams(0)}>
                Execution ID
              </Th>
              {showWorkflowColumn && (
                <Th modifier="nowrap" style={{ minWidth: '200px', width: '200px' }} sort={getSortParams(1)}>
                  Workflow
                </Th>
              )}
              <Th sort={getSortParams(showWorkflowColumn ? 2 : 1)}>Status</Th>
              <Th sort={getSortParams(showWorkflowColumn ? 3 : 2)}>Created at</Th>
              <Th sort={getSortParams(showWorkflowColumn ? 4 : 3)}>Completed at</Th>
            </Tr>
          </Thead>
          <Tbody>
            {filteredExecutions.map((execution) => (
              <Tr key={execution.id}>
                <Td dataLabel="Execution ID" modifier="nowrap" style={{ minWidth: '250px', width: '250px' }}>
                  <LinkCell href={`/executions/${execution.id}`}>
                    <code style={{ fontSize: 'var(--pf-t--global--font-size--sm)' }}>{execution.id}</code>
                  </LinkCell>
                </Td>
                {showWorkflowColumn && (
                  <Td dataLabel="Workflow" modifier="nowrap" style={{ minWidth: '200px', width: '200px' }}>
                    <LinkCell href={`/automation-builder/${execution.workflow_id}`}>{execution.workflow_id}</LinkCell>
                  </Td>
                )}
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
            ))}
          </Tbody>
        </ScrollableTableContainer>
      )}
    </AppPage>
  )
}
