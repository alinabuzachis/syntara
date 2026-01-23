import type { WorkflowAPI } from '@ansible/nexus-contracts'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionToggle,
  Content,
  ContentVariants,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Flex,
  FlexItem,
  Stack,
  StackItem,
} from '@patternfly/react-core'
import { useState } from 'react'

import { CodeBlock } from '../../../components/details/CodeBlock'
import { StatusLabel } from '../ExecutionStatus'

type ActivityExecution = WorkflowAPI.components['schemas']['ActivityExecution']

interface ActivityTimelineProps {
  activities: ActivityExecution[]
  currentActivityId?: string
}

/**
 * Timeline view of activity executions with expandable details.
 * Shows activity name, status, timing, and allows expansion for input/output data.
 */
export function ActivityTimeline({ activities, currentActivityId }: ActivityTimelineProps) {
  const [expandedActivities, setExpandedActivities] = useState<Set<string>>(new Set())

  const toggleActivity = (activityId: string) => {
    setExpandedActivities((prev) => {
      const next = new Set(prev)
      if (next.has(activityId)) {
        next.delete(activityId)
      } else {
        next.add(activityId)
      }
      return next
    })
  }

  const formatDuration = (startedAt: string | null, completedAt: string | null) => {
    if (!startedAt) return 'Not started'
    if (!completedAt) return 'Running...'

    const start = new Date(startedAt).getTime()
    const end = new Date(completedAt).getTime()
    const durationMs = end - start

    if (durationMs < 1000) return `${durationMs}ms`
    if (durationMs < 60000) return `${(durationMs / 1000).toFixed(1)}s`
    const minutes = Math.floor(durationMs / 60000)
    const seconds = Math.floor((durationMs % 60000) / 1000)
    return `${minutes}m ${seconds}s`
  }

  if (activities.length === 0) {
    return (
      <Content component={ContentVariants.p} style={{ padding: 'var(--pf-t--global--spacer--md)' }}>
        No activities executed yet
      </Content>
    )
  }

  return (
    <Accordion asDefinitionList={false}>
      {activities.map((activity) => {
        const isExpanded = expandedActivities.has(activity.id)
        const isCurrent = activity.id === currentActivityId

        return (
          <AccordionItem key={activity.id}>
            <AccordionToggle
              onClick={() => toggleActivity(activity.id)}
              isExpanded={isExpanded}
              id={`activity-toggle-${activity.id}`}
              style={{
                backgroundColor: isCurrent ? 'var(--pf-t--global--color--brand--default)' : undefined,
                opacity: isCurrent ? 0.1 : undefined,
              }}
            >
              <Flex
                justifyContent={{ default: 'justifyContentSpaceBetween' }}
                alignItems={{ default: 'alignItemsCenter' }}
              >
                <FlexItem>
                  <Stack>
                    <StackItem>
                      <Content component={ContentVariants.small}>
                        <strong>{activity.activity_id}</strong>
                      </Content>
                    </StackItem>
                    <StackItem>
                      <Content component={ContentVariants.small} style={{ opacity: 0.7 }}>
                        {formatDuration(activity.started_at, activity.completed_at)}
                      </Content>
                    </StackItem>
                  </Stack>
                </FlexItem>
                <FlexItem>
                  <Flex gap={{ default: 'gapMd' }} alignItems={{ default: 'alignItemsCenter' }}>
                    {activity.retry_count !== undefined && activity.retry_count > 0 && (
                      <FlexItem>
                        <Content component={ContentVariants.small}>Retries: {activity.retry_count}</Content>
                      </FlexItem>
                    )}
                    {activity.iteration !== undefined && activity.iteration !== null && (
                      <FlexItem>
                        <Content component={ContentVariants.small}>Iteration: {activity.iteration}</Content>
                      </FlexItem>
                    )}
                    <FlexItem>
                      <StatusLabel status={activity.status!} />
                    </FlexItem>
                  </Flex>
                </FlexItem>
              </Flex>
            </AccordionToggle>
            <AccordionContent id={`activity-content-${activity.id}`} isHidden={!isExpanded}>
              <Stack hasGutter>
                <StackItem>
                  <DescriptionList isCompact>
                    <DescriptionListGroup>
                      <DescriptionListTerm>Activity ID</DescriptionListTerm>
                      <DescriptionListDescription>
                        <Content component={ContentVariants.small}>{activity.id}</Content>
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                    <DescriptionListGroup>
                      <DescriptionListTerm>Temporal Activity ID</DescriptionListTerm>
                      <DescriptionListDescription>
                        <Content component={ContentVariants.small}>{activity.temporal_activity_id}</Content>
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                    {activity.started_at && (
                      <DescriptionListGroup>
                        <DescriptionListTerm>Started At</DescriptionListTerm>
                        <DescriptionListDescription>
                          <Content component={ContentVariants.small}>
                            {new Date(activity.started_at).toLocaleString()}
                          </Content>
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                    )}
                    {activity.completed_at && (
                      <DescriptionListGroup>
                        <DescriptionListTerm>Completed At</DescriptionListTerm>
                        <DescriptionListDescription>
                          <Content component={ContentVariants.small}>
                            {new Date(activity.completed_at).toLocaleString()}
                          </Content>
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                    )}
                  </DescriptionList>
                </StackItem>

                {activity.input_data && Object.keys(activity.input_data).length > 0 && (
                  <StackItem>
                    <Content component={ContentVariants.h4}>Input Data</Content>
                    <CodeBlock code={JSON.stringify(activity.input_data, null, 2)} language="json" />
                  </StackItem>
                )}

                {activity.output_data && Object.keys(activity.output_data).length > 0 && (
                  <StackItem>
                    <Content component={ContentVariants.h4}>Output Data</Content>
                    <CodeBlock code={JSON.stringify(activity.output_data, null, 2)} language="json" />
                  </StackItem>
                )}

                {activity.error_details && (
                  <StackItem>
                    <Content
                      component={ContentVariants.h4}
                      style={{ color: 'var(--pf-t--global--color--status--danger--default)' }}
                    >
                      Error Details
                    </Content>
                    <CodeBlock code={activity.error_details} language="text" />
                  </StackItem>
                )}
              </Stack>
            </AccordionContent>
          </AccordionItem>
        )
      })}
    </Accordion>
  )
}
