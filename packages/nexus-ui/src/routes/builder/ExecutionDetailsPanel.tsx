import type { WorkflowAPI } from '@ansible/nexus-contracts'
import {
  CompassPanel,
  Content,
  ContentVariants,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Flex,
  Icon,
  Stack,
  StackItem,
  Title,
  TitleSizes,
} from '@patternfly/react-core'
import { RhUiPlayFillIcon } from '@patternfly/react-icons'
import { useEffect, useMemo, useRef, useState } from 'react'

import { workflowClient } from '../../client'
import { useQueryState } from '../../components/states/useQueryState'
import { useExecutionStoreActions } from '../automations/stores/useExecutionStore'

import { StatusLabel } from './ExecutionStatus'

type ActivityExecution = WorkflowAPI.components['schemas']['ActivityExecution']

function formatElapsedTime(elapsedMs: number) {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const parts: string[] = []
  if (hours > 0) {
    parts.push(`${hours}h`)
  }
  if (minutes > 0 || hours > 0) {
    parts.push(`${minutes}m`)
  }
  parts.push(`${seconds}s`)

  return parts.join(' ')
}

interface ExecutionDetailsPanelProps {
  executionId: string
}

/**
 * Panel displaying detailed execution information including execution metadata.
 */
export function ExecutionDetailsPanel({ executionId }: ExecutionDetailsPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { setActivityExecutions } = useExecutionStoreActions()
  const [now, setNow] = useState(() => Date.now())

  // Fetch execution details with activities included
  const executionQuery = workflowClient.useQuery('get', '/executions/{execution_id}', {
    params: {
      path: { execution_id: executionId },
      query: {
        include: 'activities',
      },
    },
  })

  const execution = executionQuery.data
  const isRunning = execution?.status === 'running' || execution?.status === 'pending'
  const startedAtValue = execution?.started_at ?? execution?.created_at ?? null
  const startedAtMs = startedAtValue ? Date.parse(startedAtValue) : null
  const completedAtMs = execution?.completed_at ? Date.parse(execution.completed_at) : null

  useEffect(() => {
    if (!startedAtMs || !isRunning || completedAtMs) {
      return
    }

    const interval = setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => clearInterval(interval)
  }, [startedAtMs, isRunning, completedAtMs])

  const elapsedMs = useMemo(() => {
    if (!startedAtMs || Number.isNaN(startedAtMs)) {
      return undefined
    }

    const endMs = completedAtMs && !Number.isNaN(completedAtMs) ? completedAtMs : isRunning ? now : undefined

    if (!endMs) {
      return undefined
    }

    return Math.max(0, endMs - startedAtMs)
  }, [startedAtMs, completedAtMs, isRunning, now])

  const elapsedLabel = elapsedMs !== undefined ? formatElapsedTime(elapsedMs) : undefined

  // Update execution store when activities load
  useEffect(() => {
    const executionActivities = (execution?.activities as unknown as ActivityExecution[]) ?? []
    if (executionActivities.length > 0) {
      setActivityExecutions(executionActivities)
    }
  }, [execution?.activities, setActivityExecutions])

  // Auto-scroll to top when execution changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
  }, [executionId])

  const queryState = useQueryState(executionQuery, 'Error loading execution')
  if (queryState || !execution) {
    return (
      <CompassPanel
        style={{
          height: '100%',
          maxHeight: '100%',
          width: '24rem',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Stack>
          <StackItem style={{ padding: 'var(--pf-t--global--spacer--lg)' }}>
            <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapMd' }}>
              <Icon>
                <RhUiPlayFillIcon />
              </Icon>
              <Title headingLevel="h2" size={TitleSizes.lg}>
                Execution View
              </Title>
            </Flex>
          </StackItem>
          <StackItem isFilled style={{ padding: 'var(--pf-t--global--spacer--lg)' }}>
            {queryState}
          </StackItem>
        </Stack>
      </CompassPanel>
    )
  }

  return (
    <CompassPanel
      style={{
        height: '100%',
        maxHeight: '100%',
        width: '100%',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <Stack style={{ height: '100%', overflow: 'hidden' }}>
        {/* Header */}
        <StackItem style={{ flexShrink: 0, padding: 'var(--pf-t--global--spacer--lg)' }}>
          <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapMd' }}>
            <Icon>
              <RhUiPlayFillIcon />
            </Icon>
            <Title headingLevel="h2" size={TitleSizes.lg}>
              Execution View
            </Title>
          </Flex>
        </StackItem>

        {/* Scrollable content */}
        <StackItem
          ref={scrollRef}
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
          <Stack hasGutter>
            {/* Execution metadata */}
            <StackItem>
              <Content component={ContentVariants.h3}>Execution Details</Content>
              <DescriptionList isCompact>
                <DescriptionListGroup>
                  <DescriptionListTerm>Status</DescriptionListTerm>
                  <DescriptionListDescription>
                    <StatusLabel status={execution.status!} />
                  </DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Elapsed time</DescriptionListTerm>
                  <DescriptionListDescription>
                    {elapsedLabel ? (
                      <Content
                        component={ContentVariants.small}
                        style={{ color: 'var(--pf-t--global--text--color--subtle)' }}
                      >
                        {elapsedLabel}
                      </Content>
                    ) : (
                      <Content
                        component={ContentVariants.small}
                        style={{ color: 'var(--pf-t--global--text--color--subtle)' }}
                      >
                        —
                      </Content>
                    )}
                  </DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Execution ID</DescriptionListTerm>
                  <DescriptionListDescription>
                    <Content component={ContentVariants.small}>{execution.id}</Content>
                  </DescriptionListDescription>
                </DescriptionListGroup>
                {execution?.temporal_workflow_id && (
                  <DescriptionListGroup>
                    <DescriptionListTerm>Temporal Workflow ID</DescriptionListTerm>
                    <DescriptionListDescription>
                      <Content component={ContentVariants.small}>{execution.temporal_workflow_id}</Content>
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                )}
                {execution?.started_at && (
                  <DescriptionListGroup>
                    <DescriptionListTerm>Started At</DescriptionListTerm>
                    <DescriptionListDescription>
                      <Content component={ContentVariants.small}>
                        {new Date(execution.started_at).toLocaleString()}
                      </Content>
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                )}
                {execution?.completed_at && (
                  <DescriptionListGroup>
                    <DescriptionListTerm>Completed At</DescriptionListTerm>
                    <DescriptionListDescription>
                      <Content component={ContentVariants.small}>
                        {new Date(execution.completed_at).toLocaleString()}
                      </Content>
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                )}
                {execution?.error_details && (
                  <DescriptionListGroup>
                    <DescriptionListTerm>Error</DescriptionListTerm>
                    <DescriptionListDescription>
                      <Content
                        component={ContentVariants.small}
                        style={{ color: 'var(--pf-t--global--color--status--danger--default)' }}
                      >
                        {execution.error_details}
                      </Content>
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                )}
              </DescriptionList>
            </StackItem>
          </Stack>
        </StackItem>
      </Stack>
    </CompassPanel>
  )
}
