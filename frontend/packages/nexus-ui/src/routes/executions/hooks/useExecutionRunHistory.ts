import { useMemo } from 'react'

import { executionsClient } from '../../../client'
import { useCursorPagination } from '../../../hooks/useCursorPagination'
import { runHistoryDefaultSort, runHistoryTableColumns } from '../../builder/runHistoryTableColumns'

/** Cursor pagination, sort, and list query for the Run History panel on execution detail. */
export function useExecutionRunHistory(workflowId: string | undefined) {
  const executionExtraParams = useMemo(() => ({ workflow_id: workflowId ?? '' }), [workflowId])

  const {
    filters: executionFilters,
    queryParams: executionsQueryParams,
    handleFilterChange: handleExecutionFilterChange,
    getFooterProps: getExecutionPaginationFooterProps,
    getSortParams: getExecutionSortParams,
  } = useCursorPagination({
    limit: 20,
    extraParams: executionExtraParams,
    defaultSort: runHistoryDefaultSort,
    columns: runHistoryTableColumns,
  })

  const executionsQuery = executionsClient.useQuery(
    'get',
    '/executions',
    {
      params: { query: executionsQueryParams },
    },
    {
      enabled: !!workflowId,
    }
  )

  const executionPaginationFooterProps = useMemo(
    () => getExecutionPaginationFooterProps(executionsQuery.data),
    [getExecutionPaginationFooterProps, executionsQuery.data]
  )

  return {
    executionFilters,
    handleExecutionFilterChange,
    getExecutionSortParams,
    executionsQuery,
    executionPaginationFooterProps,
  }
}
