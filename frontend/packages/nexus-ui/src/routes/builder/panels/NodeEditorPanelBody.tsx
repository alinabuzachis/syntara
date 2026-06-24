import { Flex, FlexItem, Panel, PanelMain, PanelMainBody } from '@patternfly/react-core'
import type { ReactNode } from 'react'

import type { WorkflowMetadata } from '../types/workflowMetadata'

import { useAdjacentNodes } from './hooks/useAdjacentNodes'
import { InputPanel } from './InputPanel'
import { NodePanelNavigationArrow } from './NodePanelNavigationArrow'
import { OutputPanel } from './OutputPanel'
import { RightSidePill } from './RightSidePill'

type NodeEditorPanelBodyProps = {
  showInputPanel: boolean
  showNavigation: boolean
  nodeId?: string
  nodeFlowType?: string
  sourceNodeId?: string | null
  inputData: Record<string, Record<string, unknown>> | null
  outputData: Record<string, unknown> | null
  outputFlex: 'flex_1' | 'flex_2'
  parametersContent: ReactNode
  onNavigateToNode?: (nodeId: string) => void
  onAddStep?: (handle?: string) => void
  workflowMetadata?: WorkflowMetadata
}

export function NodeEditorPanelBody({
  showInputPanel,
  showNavigation,
  nodeId,
  nodeFlowType,
  sourceNodeId,
  inputData,
  outputData,
  outputFlex,
  parametersContent,
  onNavigateToNode,
  onAddStep,
  workflowMetadata,
}: Readonly<NodeEditorPanelBodyProps>) {
  const { upstream, downstream } = useAdjacentNodes(showNavigation ? nodeId : undefined)
  const showPreviousArrow = showNavigation && upstream.length > 0 && onNavigateToNode != null
  const showNextArrow = showNavigation && downstream.length > 0 && onNavigateToNode != null
  const showAddStepPill = onAddStep != null

  return (
    <Flex
      alignItems={{ default: 'alignItemsStretch' }}
      flexWrap={{ default: 'nowrap' }}
      gap={{ default: 'gapNone' }}
      style={{ height: '100%', minWidth: 0 }}
    >
      {showPreviousArrow && (
        <FlexItem style={{ flexShrink: 0, alignSelf: 'center' }}>
          <NodePanelNavigationArrow direction="previous" nodes={upstream} onNavigate={onNavigateToNode} />
        </FlexItem>
      )}
      <FlexItem flex={{ default: 'flex_1' }} style={{ minWidth: 0, minHeight: 0, height: '100%' }}>
        <Flex
          alignItems={{ default: 'alignItemsStretch' }}
          flexWrap={{ default: 'nowrap' }}
          gap={{ default: 'gapSm' }}
          style={{
            height: '100%',
            minWidth: 0,
            paddingLeft: showPreviousArrow ? undefined : 'var(--pf-t--global--spacer--sm)',
            paddingRight: showNextArrow ? undefined : 'var(--pf-t--global--spacer--sm)',
          }}
        >
          {showInputPanel && (
            <FlexItem
              flex={{ default: 'flex_1' }}
              style={{
                minWidth: 0,
                minHeight: 0,
                height: '100%',
              }}
            >
              <InputPanel
                nodeId={nodeId ?? ''}
                executionData={inputData}
                sourceNodeId={sourceNodeId}
                workflowMetadata={workflowMetadata}
              />
            </FlexItem>
          )}
          <FlexItem
            flex={{ default: 'flex_1' }}
            style={{
              minWidth: 0,
              minHeight: 0,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <Panel
              variant="raised"
              style={{
                height: '100%',
                maxHeight: '100%',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <PanelMain
                style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}
              >
                <PanelMainBody
                  style={{
                    height: '100%',
                    overflowY: 'auto',
                    flex: 1,
                    minHeight: 0,
                  }}
                >
                  {parametersContent}
                </PanelMainBody>
              </PanelMain>
            </Panel>
          </FlexItem>
          <FlexItem
            flex={{ default: outputFlex }}
            style={{
              minWidth: 0,
              minHeight: 0,
              height: '100%',
            }}
          >
            <OutputPanel outputData={outputData} nodeId={nodeId ?? ''} />
          </FlexItem>
        </Flex>
      </FlexItem>
      {(showNextArrow || showAddStepPill) && (
        <FlexItem style={{ flexShrink: 0, alignSelf: 'center' }}>
          <Flex direction={{ default: 'column' }} gap={{ default: 'gapNone' }}>
            {showNextArrow && (
              <FlexItem>
                <NodePanelNavigationArrow direction="next" nodes={downstream} onNavigate={onNavigateToNode} />
              </FlexItem>
            )}
            {showAddStepPill && (
              <FlexItem>
                <RightSidePill nodeFlowType={nodeFlowType} onAddStep={onAddStep} />
              </FlexItem>
            )}
          </Flex>
        </FlexItem>
      )}
    </Flex>
  )
}
