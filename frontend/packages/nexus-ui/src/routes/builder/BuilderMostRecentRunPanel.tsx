import { StackItem } from '@patternfly/react-core'

import { ResizableDivider } from '../../components/ResizableDivider'

import { ExecutionDetailsPanel } from './ExecutionDetailsPanel'

type BuilderMostRecentRunPanelProps = Readonly<{
  executionId: string
  workflowDefinition: Parameters<typeof ExecutionDetailsPanel>[0]['workflowDefinition']
  panelHeight: number
  selectedNodeId: string | null
  selectedNodeName: string | null
  onResize: (height: number) => void
  onNodeSelect: (nodeId: string, nodeName: string) => void
  onDeselectNode: () => void
  onClosePanel?: () => void
}>

export function BuilderMostRecentRunPanel({
  executionId,
  workflowDefinition,
  panelHeight,
  selectedNodeId,
  selectedNodeName,
  onResize,
  onNodeSelect,
  onDeselectNode,
  onClosePanel,
}: BuilderMostRecentRunPanelProps) {
  return (
    <>
      <ResizableDivider onResize={onResize} />
      <StackItem style={{ height: `${panelHeight}px`, flexShrink: 0, overflow: 'hidden' }}>
        <ExecutionDetailsPanel
          executionId={executionId}
          workflowDefinition={workflowDefinition}
          selectedNodeId={selectedNodeId}
          selectedNodeName={selectedNodeName}
          onNodeSelect={onNodeSelect}
          onDeselectNode={onDeselectNode}
          headerLabel="Most recent run details"
          onClosePanel={onClosePanel}
        />
      </StackItem>
    </>
  )
}
