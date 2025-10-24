import { Scrollable } from '@ansible/nexus-ui-framework'
import { ReactFlowProvider } from '@xyflow/react'
import clsx from 'clsx'
import type { WorkflowWithVersion } from 'nexus-contracts'
import { useMemo, useState, type ReactNode } from 'react'
import { useParams } from 'wouter'
import { AppPage } from '../../app/AppPage'
import { AppPageHeader } from '../../app/AppPageHeader'
import { workflowClient } from '../../client'
import { CodeBlock } from '../../components/details/CodeBlock'
import { Detail } from '../../components/details/Detail'
import { Details } from '../../components/details/Details'
import { useQueryState } from '../../components/states/useQueryState'
import { AutomationFlow } from './canvas/AutomationFlow'
import { NodeExpandedAllContext } from './canvas/nodes/common/NodeExpandedAllContext'
import { useSelectedNodes } from './canvas/nodes/common/useSelectedNode'
import { ConditionNodeDetails } from './canvas/nodes/ConditionNode'
import type { NodeType } from './canvas/nodes/NodeType'
import { TaskActivityDetails } from './canvas/nodes/TaskNode'
import { TriggerNodeDetails } from './canvas/nodes/TriggerNode'

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
    <ReactFlowProvider>
      <NodeExpandedAllContext.Provider value={{ expandAllEvent, collapseAllEvent }}>
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
            <AutomationSidepanel workflow={workflow} />
          </div>
        </AppPage>
      </NodeExpandedAllContext.Provider>
    </ReactFlowProvider>
  )
}

export function AutomationSidepanel(props: { workflow: WorkflowWithVersion }) {
  const selectedNodes = useSelectedNodes()
  const selectedNode = selectedNodes.length === 1 ? selectedNodes[0] : null
  return (
    <div
      className={clsx('glass flex max-h-full max-w-100 flex-col gap-4 rounded-4xl border-2 py-6', {
        selected: selectedNode,
      })}
    >
      {selectedNodes.length === 0 ? (
        <>
          <header>
            <h2 className="px-6 text-lg font-semibold">Workflow Details</h2>
          </header>
          <Scrollable className="px-6">
            <Details>
              <Detail label="Workflow Definition">
                <CodeBlock jsonObject={props.workflow.version?.workflow_definition} />
              </Detail>
            </Details>
          </Scrollable>
        </>
      ) : selectedNodes.length === 1 ? (
        <AutomationSidepanelNodeDetails node={selectedNodes[0] as NodeType} />
      ) : (
        <Details>
          <ul className="list-inside list-disc">
            {selectedNodes.map((node) => (
              <li key={node.id}>{JSON.stringify(node.data, null, 2)}</li>
            ))}
          </ul>
        </Details>
      )}
    </div>
  )
}

function AutomationSidepanelNodeDetails(props: { node: NodeType }) {
  switch (props.node.type) {
    case 'trigger':
      return <TriggerNodeDetails node={props.node.data} />
    case 'task':
      return <TaskActivityDetails data={props.node.data} showJson />
    case 'condition':
      return <ConditionNodeDetails conditionActivity={props.node.data} showJson />
  }
  return <CodeBlock jsonObject={props.node.data} />
}
