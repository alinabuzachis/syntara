import { Button, Flex, FlexItem, Stack, StackItem, Tooltip } from '@patternfly/react-core'
import { RhUiExternalLinkIcon, RhUiMinusIcon } from '@patternfly/react-icons'
import type { ReactNode } from 'react'

import { NxPanel } from '../../components/layout/NxPanel'

import { useNodeExecutionData } from './panels/hooks/useNodeExecutionData'
import { NodeEditorPanelBody } from './panels/NodeEditorPanelBody'
import type { WorkflowMetadata } from './types/workflowMetadata'

function DocumentationButton({ href }: Readonly<{ href?: string }>) {
  if (href) {
    return (
      <Button
        variant="link"
        icon={<RhUiExternalLinkIcon />}
        iconPosition="end"
        component="a"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Documentation (opens in a new tab)"
      >
        Documentation
      </Button>
    )
  }
  return (
    <Tooltip content="Coming soon">
      <Button variant="link" icon={<RhUiExternalLinkIcon />} iconPosition="end" type="button" isDisabled>
        Documentation
      </Button>
    </Tooltip>
  )
}

type NodeEditorLayoutProps = {
  parametersContent: ReactNode
  headerContent?: ReactNode
  headerIcon?: ReactNode
  headerActions?: ReactNode
  docLink?: string
  showInputPanel: boolean
  nodeId?: string
  executionId?: string | null
  workflowId?: string | null
  onClose?: () => void
  showClose?: boolean
  sourceNodeId?: string | null
  formId?: string
  showNavigation?: boolean
  onNavigateToNode?: (nodeId: string) => void
  workflowMetadata?: WorkflowMetadata
}

export function NodeEditorLayout({
  parametersContent,
  headerContent,
  headerIcon,
  headerActions,
  docLink,
  showInputPanel,
  nodeId,
  executionId,
  workflowId,
  onClose,
  showClose = true,
  sourceNodeId,
  formId,
  showNavigation = false,
  onNavigateToNode,
  workflowMetadata,
}: NodeEditorLayoutProps) {
  const { inputData, outputData } = useNodeExecutionData(nodeId ?? '', executionId, workflowId)
  const outputFlex = showInputPanel ? 'flex_1' : 'flex_2'

  return (
    <NxPanel
      hasNoPadding
      isFullHeight
      isGlass={false}
      opaqueFloatingFill
      style={{
        height: '100%',
        maxHeight: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Stack style={{ flex: 1, minHeight: 0, height: '100%', overflow: 'hidden' }}>
        <StackItem style={{ padding: 'var(--pf-t--global--spacer--sm)' }}>
          <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
            <FlexItem grow={{ default: 'grow' }} style={{ minWidth: 0 }}>
              <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapMd' }}>
                {headerIcon && (
                  <FlexItem
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      paddingLeft: 'var(--pf-t--global--spacer--xs)',
                      paddingRight: 'var(--pf-t--global--spacer--xs)',
                    }}
                  >
                    {headerIcon}
                  </FlexItem>
                )}
                {headerContent && <FlexItem>{headerContent}</FlexItem>}
              </Flex>
            </FlexItem>
            <FlexItem>
              <Flex
                justifyContent={{ default: 'justifyContentFlexEnd' }}
                alignItems={{ default: 'alignItemsCenter' }}
                gap={{ default: 'gapSm' }}
              >
                <FlexItem>
                  <DocumentationButton href={docLink} />
                </FlexItem>
                {headerActions && <FlexItem>{headerActions}</FlexItem>}
                {showClose && (
                  <>
                    <FlexItem>
                      <Button
                        variant="link"
                        onClick={() => {
                          onClose?.()
                        }}
                        aria-label="Cancel without saving"
                        type="button"
                      >
                        Cancel
                      </Button>
                    </FlexItem>
                    <FlexItem>
                      <Tooltip content="Save and close">
                        <Button
                          variant="plain"
                          onClick={() => {
                            if (formId) {
                              const element = document.getElementById(formId)
                              if (element instanceof HTMLFormElement) {
                                element.requestSubmit()
                              } else {
                                onClose?.()
                              }
                            } else {
                              onClose?.()
                            }
                          }}
                          aria-label="Save and close"
                          type="button"
                        >
                          <RhUiMinusIcon />
                        </Button>
                      </Tooltip>
                    </FlexItem>
                  </>
                )}
              </Flex>
            </FlexItem>
          </Flex>
        </StackItem>
        <StackItem
          isFilled
          style={{
            minHeight: 0,
            overflow: 'visible',
            padding: 'var(--pf-t--global--spacer--sm) 0',
          }}
        >
          <NodeEditorPanelBody
            showInputPanel={showInputPanel}
            showNavigation={showNavigation}
            nodeId={nodeId}
            sourceNodeId={sourceNodeId}
            inputData={inputData}
            outputData={outputData}
            outputFlex={outputFlex}
            parametersContent={parametersContent}
            onNavigateToNode={onNavigateToNode}
            workflowMetadata={workflowMetadata}
          />
        </StackItem>
      </Stack>
    </NxPanel>
  )
}
