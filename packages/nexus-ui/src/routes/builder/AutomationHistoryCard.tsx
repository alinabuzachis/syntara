import type { WorkflowAPI } from '@ansible/nexus-contracts'
import {
  Button,
  CompassPanel,
  Content,
  ContentVariants,
  Flex,
  FlexItem,
  Icon,
  Stack,
  StackItem,
  Title,
  TitleSizes,
} from '@patternfly/react-core'
import { RhUiHistoryIcon, RhUiCloseIcon } from '@patternfly/react-icons'

import { StatusLabel } from './ExecutionStatus'

type Execution = WorkflowAPI.components['schemas']['Execution']

interface AutomationHistoryCardProps {
  executions: Execution[]
  onClose: () => void
}

export function AutomationHistoryCard(props: AutomationHistoryCardProps) {
  const executions = props.executions

  return (
    <CompassPanel
      style={{
        height: '100%',
        maxHeight: '100%',
        width: '20rem',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <Stack>
        <StackItem style={{ flexShrink: 0, padding: 'var(--pf-t--global--spacer--lg)' }}>
          <Flex alignItems={{ default: 'alignItemsCenter' }} justifyContent={{ default: 'justifyContentSpaceBetween' }}>
            <FlexItem>
              <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapMd' }}>
                <Icon>
                  <RhUiHistoryIcon />
                </Icon>
                <Title headingLevel="h2" size={TitleSizes.lg}>
                  Run History
                </Title>
              </Flex>
            </FlexItem>
            <FlexItem>
              <Button variant="plain" onClick={props.onClose} aria-label="Close">
                <Icon>
                  <RhUiCloseIcon />
                </Icon>
              </Button>
            </FlexItem>
          </Flex>
        </StackItem>
        <StackItem
          isFilled
          style={{
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            paddingLeft: 'var(--pf-t--global--spacer--lg)',
            paddingRight: 'var(--pf-t--global--spacer--lg)',
            paddingBottom: 'var(--pf-t--global--spacer--lg)',
          }}
        >
          {executions.length === 0 ? (
            <Content component={ContentVariants.p}>No execution history available</Content>
          ) : (
            <table style={{ width: '100%' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.2)' }}>
                  <th style={{ paddingBottom: 'var(--pf-t--global--spacer--sm)', textAlign: 'left', fontWeight: 600 }}>
                    Created At
                  </th>
                  <th style={{ paddingBottom: 'var(--pf-t--global--spacer--sm)', textAlign: 'left', fontWeight: 600 }}>
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {executions.map((execution) => {
                  const date = execution.created_at ? new Date(execution.created_at) : null
                  return (
                    <tr key={execution.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                      <td
                        style={{
                          paddingTop: 'var(--pf-t--global--spacer--sm)',
                          paddingBottom: 'var(--pf-t--global--spacer--sm)',
                        }}
                      >
                        {date ? (
                          <Stack>
                            <StackItem>
                              <Content style={{ whiteSpace: 'nowrap' }}>{date.toLocaleDateString()}</Content>
                            </StackItem>
                            <StackItem>
                              <Content style={{ whiteSpace: 'nowrap', opacity: 0.6 }}>
                                {date.toLocaleTimeString()}
                              </Content>
                            </StackItem>
                          </Stack>
                        ) : (
                          <Content>Unknown</Content>
                        )}
                      </td>
                      <td
                        style={{
                          paddingTop: 'var(--pf-t--global--spacer--sm)',
                          paddingBottom: 'var(--pf-t--global--spacer--sm)',
                        }}
                      >
                        <StatusLabel status={execution.status!} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </StackItem>
      </Stack>
    </CompassPanel>
  )
}
