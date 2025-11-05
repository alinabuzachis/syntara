import { AppPage } from '../../app/AppPage'
import { AppPageHeader } from '../../app/AppPageHeader'
import { workflowClient } from '../../client'
import { useQueryState } from '../../components/states/useQueryState'
import { DateCell } from '../../components/table/DateCell'
import { LinkCell } from '../../components/table/LinkCell'
import { Table } from '../../components/table/Table'
import { useFuse } from '../../hooks/useFuse'
import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { useSearch } from 'wouter'
import { useMemo } from 'react'

type ExecutionStatus = WorkflowAPI.components['schemas']['ExecutionStatus']

const statusColors: Record<ExecutionStatus, string> = {
  pending: 'bg-gray-500/30 text-gray-50 border-gray-500/60',
  running: 'bg-blue-500/30 text-blue-50 border-blue-500/60',
  paused: 'bg-yellow-500/30 text-yellow-50 border-yellow-500/60',
  completed: 'bg-green-500/30 text-green-50 border-green-500/60',
  failed: 'bg-red-500/30 text-red-50 border-red-500/60',
  cancelled: 'bg-orange-500/30 text-orange-50 border-orange-500/60',
}

function StatusBadge({ status }: { status: ExecutionStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border-2 px-2.5 py-0.5 text-xs font-semibold ${statusColors[status]}`}
    >
      {status}
    </span>
  )
}

export default function Executions() {
  const searchParams = useSearch()
  const urlParams = useMemo(() => new URLSearchParams(searchParams), [searchParams])
  const workflowIdFilter = urlParams.get('workflow_id')

  const executionsQuery = workflowClient.useQuery('get', '/executions', {
    params: {
      query: workflowIdFilter ? { workflow_id: workflowIdFilter } : {},
    },
  })
  const executions = executionsQuery.data?.resources ?? []

  const workflowQuery = workflowClient.useQuery('get', '/workflows/{workflow_id}', {
    params: {
      path: { workflow_id: workflowIdFilter! },
    },
    enabled: !!workflowIdFilter,
  })

  const { search, setSearch, items: filteredExecutions } = useFuse(executions, [{ name: 'workflow_id' }])

  const queryState = useQueryState(executionsQuery, 'Error loading executions')
  if (queryState) return queryState

  const pageTitle =
    workflowIdFilter && workflowQuery.data ? `Run history for ${workflowQuery.data.name}` : 'Run history'

  return (
    <AppPage>
      <AppPageHeader title={pageTitle}>
        <input
          className="search grow"
          placeholder="Search executions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </AppPageHeader>
      <Table
        items={filteredExecutions}
        keyFn={(item) => item.id}
        columns={[
          {
            id: 'id',
            label: 'Execution ID',
            width: '250px',
            render: (execution) => (
              <LinkCell href={`/executions/${execution.id}`}>
                <code className="text-sm">{execution.id?.slice(0, 8)}...</code>
              </LinkCell>
            ),
          },
          {
            id: 'workflow_id',
            label: 'Workflow',
            render: (execution) => (
              <LinkCell href={`/automations/${execution.workflow_id}`}>
                {execution.workflow_id?.slice(0, 8)}...
              </LinkCell>
            ),
          },
          {
            id: 'status',
            label: 'Status',
            width: '150px',
            render: (execution) => <StatusBadge status={execution.status!} />,
          },
          {
            id: 'created_at',
            label: 'Created At',
            render: (execution) => <DateCell dateString={execution.created_at} />,
          },
          {
            id: 'completed_at',
            label: 'Completed At',
            render: (execution) =>
              execution.completed_at ? (
                <DateCell dateString={execution.completed_at} />
              ) : (
                <span className="text-gray-400">—</span>
              ),
          },
        ]}
      />
    </AppPage>
  )
}
