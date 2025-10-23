import { AppPage } from '../../app/AppPage'
import { AppPageHeader } from '../../app/AppPageHeader'
import { workflowClient } from '../../client'
import { useQueryState } from '../../components/states/useQueryState'
import { DateCell } from '../../components/table/DateCell'
import { LabelsCell } from '../../components/table/LabelsCell'
import { LinkCell } from '../../components/table/LinkCell'
import { StringCell } from '../../components/table/StringCell'
import { Table } from '../../components/table/Table'
import { useFuse } from '../../hooks/useFuse'

export default function Automations() {
  const workflowsQuery = workflowClient.useQuery('get', '/workflows')
  const workflows = workflowsQuery.data?.workflows ?? []

  const { search, setSearch, items: automations } = useFuse(workflows, [{ name: 'name' }])

  const queryState = useQueryState(workflowsQuery, 'Error loading workflows')
  if (queryState) return queryState

  return (
    <AppPage>
      <AppPageHeader title="Automations">
        <input
          className="search grow"
          placeholder="Search integrations..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </AppPageHeader>
      <Table
        items={automations}
        columns={[
          {
            id: 'name',
            label: 'Name',
            render: (workflow) => <LinkCell href={`/automations/${workflow.id}`}>{workflow.name}</LinkCell>,
          },
          {
            id: 'description',
            label: 'Description',
            render: (workflow) => <StringCell>{workflow.description}</StringCell>,
          },
          {
            id: 'created_at',
            label: 'Created At',
            render: (workflow) => <DateCell dateString={workflow.created_at} />,
          },
          {
            id: 'updated_at',
            label: 'Updated At',
            render: (workflow) => <DateCell dateString={workflow.updated_at} />,
          },
          {
            id: 'labels',
            label: 'Labels',
            render: (workflow) => <LabelsCell labels={workflow.labels} />,
          },
        ]}
      />
    </AppPage>
  )
}
