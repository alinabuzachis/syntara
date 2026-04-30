import {
  Button,
  Flex,
  FlexItem,
  Panel,
  PanelMain,
  PanelMainBody,
  Stack,
  StackItem,
  Tooltip,
} from '@patternfly/react-core'
import { ExternalLinkAltIcon, RhUiCloseIcon } from '@patternfly/react-icons'
import type { ReactNode } from 'react'

import { AppPanel } from '../../components/AppPanel'

import { useNodeExecutionData } from './panels/hooks/useNodeExecutionData'
import { InputPanel } from './panels/InputPanel'
import { OutputPanel } from './panels/OutputPanel'

type NodeEditorLayoutProps = {
  parametersContent: ReactNode
  headerContent?: ReactNode
  headerIcon?: ReactNode
  headerActions?: ReactNode
  showInputPanel: boolean
  nodeId?: string
  executionId?: string | null
  workflowId?: string | null
  onClose?: () => void
  showClose?: boolean
  sourceNodeId?: string | null
}

export function NodeEditorLayout({
  parametersContent,
  headerContent,
  headerIcon,
  headerActions,
  showInputPanel,
  nodeId,
  executionId,
  workflowId,
  onClose,
  showClose = true,
  sourceNodeId,
}: NodeEditorLayoutProps) {
  const { inputData, outputData } = useNodeExecutionData(nodeId ?? '', executionId, workflowId)
  const outputFlex = showInputPanel ? 'flex_1' : 'flex_2'
  return (
    <AppPanel
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
                  <Tooltip content="Coming soon">
                    <Button variant="link" icon={<ExternalLinkAltIcon />} iconPosition="right" type="button" isDisabled>
                      Documentation
                    </Button>
                  </Tooltip>
                </FlexItem>
                {headerActions && <FlexItem>{headerActions}</FlexItem>}
                {showClose && (
                  <FlexItem>
                    <Button variant="plain" onClick={onClose} aria-label="Close" type="button">
                      <RhUiCloseIcon />
                    </Button>
                  </FlexItem>
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
            padding: 'var(--pf-t--global--spacer--sm)',
          }}
        >
          <Flex
            alignItems={{ default: 'alignItemsStretch' }}
            flexWrap={{ default: 'nowrap' }}
            gap={{ default: 'gapSm' }}
            style={{ height: '100%', minWidth: 0 }}
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
                <InputPanel nodeId={nodeId ?? ''} executionData={inputData} sourceNodeId={sourceNodeId} />
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
              <OutputPanel outputData={outputData} />
            </FlexItem>
          </Flex>
        </StackItem>
      </Stack>
    </AppPanel>
  )
}
