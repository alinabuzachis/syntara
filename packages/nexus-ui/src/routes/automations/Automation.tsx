import { Scrollable } from '@ansible/nexus-ui-framework'
import { useState, type ReactNode } from 'react'
import { useParams } from 'wouter'
import { AppPage } from '../../app/AppPage'
import { AppPageHeader } from '../../app/AppPageHeader'
import { workflowClient } from '../../client'
import { useQueryState } from '../../components/states/useQueryState'
import { AutomationFlow } from './canvas/AutomationFlow'
import { SidePanelContext } from './SidePanelContext'

export default function Automation() {
  const workflowId = useParams().workflowId || '1'
  const workflowQuery = workflowClient.useQuery('get', '/workflows/{workflowId}', {
    params: { path: { workflowId } },
  })
  const workflow = workflowQuery.data!

  const sidePanelState = useState<ReactNode>(null)

  // const sidePanelValue = sidePanel ? (
  //   sidePanel
  // ) : (
  //   <Scrollable className="glass max-h-full max-w-100 rounded-4xl border-2 text-xs">
  //     <pre className="p-8">{JSON.stringify(workflow?.version?.workflow_definition, null, 2)}</pre>
  //   </Scrollable>
  // )

  const queryState = useQueryState(workflowQuery, 'Error loading workflow')
  if (queryState) return queryState

  return (
    <SidePanelContext.Provider value={sidePanelState}>
      <AppPage>
        <AppPageHeader title={workflow.name!} />
        <div className="relative flex grow gap-4 overflow-hidden">
          <div className="relative isolate flex grow gap-4 overflow-hidden">
            <div className="glass absolute inset-0 rounded-4xl border-2"></div>
            <AutomationFlow workflow={workflowQuery.data!} />
          </div>
          <Scrollable className="glass max-h-full max-w-100 rounded-4xl border-2 text-xs">
            {sidePanelState[0] ? (
              sidePanelState[0]
            ) : (
              <pre className="p-8">{JSON.stringify(workflow?.version?.workflow_definition, null, 2)}</pre>
            )}
          </Scrollable>
        </div>
      </AppPage>
    </SidePanelContext.Provider>
  )
}
