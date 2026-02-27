import {
  Button,
  CompassPanel,
  Flex,
  FlexItem,
  PanelMain,
  PanelMainBody,
  Stack,
  StackItem,
  Title,
} from '@patternfly/react-core'
import { ExternalLinkAltIcon, RhUiCloseIcon } from '@patternfly/react-icons'
import type { ReactNode } from 'react'

import { useAlerts } from '../../components/alerts'

interface NodeEditorLayoutProps {
  parametersContent: ReactNode
  headerContent?: ReactNode
  headerIcon?: ReactNode
  headerActions?: ReactNode
  showInputPanel: boolean
  onClose?: () => void
  showClose?: boolean
}

function EmptyDataPanel({ title }: { title: string }) {
  return (
    <CompassPanel
      style={{
        height: '100%',
        maxHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <PanelMain style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <PanelMainBody style={{ flex: 1, minHeight: 0 }}>
          <Title headingLevel="h2" size="md">
            {title}
          </Title>
        </PanelMainBody>
      </PanelMain>
    </CompassPanel>
  )
}

export function NodeEditorLayout({
  parametersContent,
  headerContent,
  headerIcon,
  headerActions,
  showInputPanel,
  onClose,
  showClose = true,
}: NodeEditorLayoutProps) {
  const outputFlex = showInputPanel ? 'flex_1' : 'flex_2'
  const { showInfo } = useAlerts()
  return (
    <CompassPanel
      hasNoPadding
      style={{
        height: '100%',
        maxHeight: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <Stack style={{ height: '100%', overflow: 'hidden' }}>
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
                  <Button
                    variant="link"
                    icon={<ExternalLinkAltIcon />}
                    iconPosition="right"
                    type="button"
                    onClick={() => showInfo('Not yet implemented')}
                  >
                    Documentation
                  </Button>
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
            overflow: 'hidden',
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
                  height: '100%',
                }}
              >
                <EmptyDataPanel title="Input" />
              </FlexItem>
            )}
            <FlexItem
              flex={{ default: 'flex_1' }}
              style={{
                minWidth: 0,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <CompassPanel
                style={{
                  height: '100%',
                  maxHeight: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
              >
                <PanelMain style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
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
              </CompassPanel>
            </FlexItem>
            <FlexItem
              flex={{ default: outputFlex }}
              style={{
                minWidth: 0,
                height: '100%',
              }}
            >
              <EmptyDataPanel title="Output" />
            </FlexItem>
          </Flex>
        </StackItem>
      </Stack>
    </CompassPanel>
  )
}
