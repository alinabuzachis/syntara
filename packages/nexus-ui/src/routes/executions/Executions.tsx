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
import { CircleDashed, Loader2, Pause, CheckCircle2, XCircle, Ban } from 'lucide-react'

type ExecutionStatus = WorkflowAPI.components['schemas']['ExecutionStatus']

const statusIcons: Record<ExecutionStatus, React.ComponentType<{ className?: string }>> = {
  pending: CircleDashed,
  running: Loader2,
  paused: Pause,
  completed: CheckCircle2,
  failed: XCircle,
  cancelled: Ban,
}

const statusColors: Record<ExecutionStatus, string> = {
  pending: 'text-gray-400',
  running: 'text-blue-400',
  paused: 'text-yellow-400',
  completed: 'text-green-400',
  failed: 'text-red-400',
  cancelled: 'text-orange-400',
}

function StatusLabel({ status }: { status: ExecutionStatus }) {
  const Icon = statusIcons[status]
  const colorClass = statusColors[status]
  const capitalizedStatus = status.charAt(0).toUpperCase() + status.slice(1)

  return (
    <div className={`flex items-center gap-1.5 ${colorClass}`}>
      <Icon className="size-4" />
      <span>{capitalizedStatus}</span>
    </div>
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
              <LinkCell href={`/automations/${execution.workflow_id}?showHistory=true`}>
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
            render: (execution) => <StatusLabel status={execution.status!} />,
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
