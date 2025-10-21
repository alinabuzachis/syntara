import { Scrollable } from '@ansible/nexus-ui-framework'
import { useParams } from 'wouter'
import { AppPage } from '../../app/AppPage'
import { AppPageHeader } from '../../app/AppPageHeader'
import { workflowClient } from '../../client'
import { useQueryState } from '../../components/states/useQueryState'
import { AutomationFlow } from './canvas/AutomationFlow'

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
      <div className="relative flex grow gap-4 overflow-hidden">
        <div className="relative isolate flex grow gap-4 overflow-hidden">
          <div className="glass absolute inset-0 rounded-4xl border-2"></div>
          <AutomationFlow workflow={workflowQuery.data!} />
        </div>
        <Scrollable className="glass max-h-full max-w-100 rounded-4xl border-2 text-xs">
          <pre className="p-8">{JSON.stringify(workflow.version?.workflow_definition, null, 2)}</pre>
        </Scrollable>
      </div>
    </AppPage>
  )
}
