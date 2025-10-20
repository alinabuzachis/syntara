import { Scrollable } from '@ansible/nexus-ui-framework'
import { useParams } from 'wouter'
import { AppPage } from '../../app/AppPage'
import { AppPageHeader } from '../../app/AppPageHeader'
import { workflowClient } from '../../client'
import { useQueryState } from '../../components/states/useQueryState'
import { AutomationFlow } from './AutomationFlow'

export default function Automation() {
  const workflowId = useParams().workflowId || '1'
  const workflowQuery = workflowClient.useQuery('get', '/workflows/{workflowId}', {
    params: { path: { workflowId } },
  })

  const queryState = useQueryState(workflowQuery, 'Error loading workflow')
  if (queryState) return queryState

  const workflow = workflowQuery.data!

  return (
    <AppPage>
      <AppPageHeader title={workflow.name!} />
      <div className="flex grow gap-4 overflow-hidden">
        <AutomationFlow workflow={workflowQuery.data!} />
        <Scrollable className="glass max-h-full rounded-4xl border text-xs">
          <pre className="p-8">{JSON.stringify(workflow.version?.workflow_definition, null, 2)}</pre>
        </Scrollable>
      </div>
    </AppPage>
  )
}
