import { Scrollable } from '@ansible/nexus-ui-framework'
import { useMemo, useState, type ReactNode } from 'react'
import { useParams } from 'wouter'
import { AppPage } from '../../app/AppPage'
import { AppPageHeader } from '../../app/AppPageHeader'
import { workflowClient } from '../../client'
import { useQueryState } from '../../components/states/useQueryState'
import { AutomationFlow } from './canvas/AutomationFlow'
import { NodeExpandedAllContext } from './canvas/nodes/common/NodeExpandedAllContext'
import { SidePanelContext } from './SidePanelContext'

export default function Automation() {
  const workflowId = useParams().workflowId || '1'
  const workflowQuery = workflowClient.useQuery('get', '/workflows/{workflowId}', {
    params: { path: { workflowId } },
  })
  const workflow = workflowQuery.data!

  const sidePanelState = useState<ReactNode>(null)
  const expandAllEvent = useMemo(() => new EventTarget(), [])
  const collapseAllEvent = useMemo(() => new EventTarget(), [])

  const queryState = useQueryState(workflowQuery, 'Error loading workflow')
  if (queryState) return queryState

  return (
    <NodeExpandedAllContext.Provider value={{ expandAllEvent, collapseAllEvent }}>
      <SidePanelContext.Provider value={sidePanelState}>
        <AppPage>
          <AppPageHeader title={workflow.name!} />
          <div className="relative flex grow gap-4 overflow-hidden">
            <div className="relative isolate flex grow gap-4 overflow-hidden">
              <div className="glass absolute inset-0 rounded-4xl border-2"></div>
              <AutomationFlow workflow={workflowQuery.data!} />
            </div>
            {sidePanelState[0] && (
              <Scrollable className="glass max-h-full max-w-100 rounded-4xl border-2 text-xs">
                {sidePanelState[0]}
              </Scrollable>
            )}
          </div>
        </AppPage>
      </SidePanelContext.Provider>
    </NodeExpandedAllContext.Provider>
  )
}
