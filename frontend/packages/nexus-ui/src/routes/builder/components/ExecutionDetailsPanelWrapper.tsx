import { StackItem } from '@patternfly/react-core'

import { ResizableDivider } from '../../../components/ResizableDivider'
import { ExecutionDetailsPanel } from '../ExecutionDetailsPanel'

type ExecutionDetailsPanelWrapperProps = {
  executionId: string
  workflowDefinition: Parameters<typeof ExecutionDetailsPanel>[0]['workflowDefinition']
  selectedNodeId: string | null
  selectedNodeName: string | null
  onNodeSelect: (nodeId: string, nodeName: string) => void
  onDeselectNode: () => void
  panelHeight: number
  onResize: (newHeight: number) => void
  isTerminalStatus: boolean
  onClosePanel?: () => void
}

export function ExecutionDetailsPanelWrapper(props: ExecutionDetailsPanelWrapperProps) {
  const {
    executionId,
    workflowDefinition,
    selectedNodeId,
    selectedNodeName,
    onNodeSelect,
    onDeselectNode,
    panelHeight,
    onResize,
    isTerminalStatus,
    onClosePanel,
  } = props

  return (
    <>
      <ResizableDivider onResize={onResize} />
      <StackItem
        style={{
          height: `${panelHeight}px`,
          flexShrink: 0,
          overflow: 'hidden',
        }}
      >
        <ExecutionDetailsPanel
          executionId={executionId}
          workflowDefinition={workflowDefinition}
          selectedNodeId={selectedNodeId}
          selectedNodeName={selectedNodeName}
          onNodeSelect={onNodeSelect}
          onDeselectNode={onDeselectNode}
          headerLabel="Most recent run details"
          onClosePanel={isTerminalStatus ? onClosePanel : undefined}
        />
      </StackItem>
    </>
  )
}
