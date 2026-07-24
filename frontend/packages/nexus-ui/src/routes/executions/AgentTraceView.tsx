import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Content,
  ContentVariants,
  ExpandableSection,
  Flex,
  FlexItem,
  Spinner,
  Stack,
  StackItem,
} from '@patternfly/react-core'
import { useState } from 'react'

import { NxCodeBlock } from '../../components/details/NxCodeBlock'
import { NxDetail } from '../../components/details/NxDetail'
import { NxDetailList } from '../../components/details/NxDetailList'
import { NxLabel } from '../../components/labels/NxLabel'
import { NxEmptyStateNoData } from '../../components/states/NxEmptyStateNoData'

import {
  groupToolSteps,
  isToolCallGroup,
  type AgentTrace,
  type AgentTraceStep,
  type ToolCallGroup,
} from './agentTraceTypes'
import styles from './AgentTraceView.module.css'

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatTokenCount(count: number): string {
  return count.toLocaleString()
}

function formatMetrics(tokens: number | undefined, durationMs: number | undefined): string | null {
  const parts: string[] = []
  if (tokens != null) parts.push(`${formatTokenCount(tokens)} tokens`)
  if (durationMs != null) parts.push(formatDuration(durationMs))
  return parts.length > 0 ? parts.join(' · ') : null
}

function HeaderBar({ trace }: Readonly<{ trace: AgentTrace }>) {
  const toolCallCount = trace.steps.filter((s) => s.type === 'tool_call').length
  return (
    <Flex className={styles.headerBar} gap={{ default: 'gapLg' }} alignItems={{ default: 'alignItemsCenter' }}>
      <FlexItem>
        <Stack>
          <StackItem className={styles.statLabel}>Model</StackItem>
          <StackItem className={styles.statValue}>{trace.model}</StackItem>
        </Stack>
      </FlexItem>
      <FlexItem>
        <Stack>
          <StackItem className={styles.statLabel}>Tokens</StackItem>
          <StackItem className={styles.statValue}>{formatTokenCount(trace.total_tokens)}</StackItem>
        </Stack>
      </FlexItem>
      <FlexItem>
        <Stack>
          <StackItem className={styles.statLabel}>Trace time</StackItem>
          <StackItem className={styles.statValue}>{formatDuration(trace.total_duration_ms)}</StackItem>
        </Stack>
      </FlexItem>
      <FlexItem>
        <Stack>
          <StackItem className={styles.statLabel}>Tool calls</StackItem>
          <StackItem className={styles.statValue}>{toolCallCount}</StackItem>
        </Stack>
      </FlexItem>
    </Flex>
  )
}

function ReasoningBlock({ step }: Readonly<{ step: AgentTraceStep }>) {
  const metrics = formatMetrics(step.tokens, step.duration_ms)
  return (
    <div className={styles.reasoningBlock}>
      <Content component={ContentVariants.small} className={styles.stepTypeLabel}>
        Reasoning
      </Content>
      <Content component={ContentVariants.p}>{step.content}</Content>
      {metrics && <span className={styles.tokensBadge}>{metrics}</span>}
    </div>
  )
}

function ToolCallCard({ group }: Readonly<{ group: ToolCallGroup }>) {
  const [isExpanded, setIsExpanded] = useState(false)
  const inputJson = JSON.stringify(group.toolInput, null, 2)
  const isFailed = group.status === 'failed'
  const metrics = formatMetrics(group.tokens, group.durationMs)

  return (
    <Card isCompact className={isFailed ? styles.toolCardFailed : undefined}>
      <CardHeader>
        <CardTitle>
          <Flex alignItems={{ default: 'alignItemsCenter' }} justifyContent={{ default: 'justifyContentSpaceBetween' }}>
            <FlexItem>
              <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
                <FlexItem>{group.toolName}</FlexItem>
                {isFailed && (
                  <FlexItem>
                    <NxLabel status="danger">Failed</NxLabel>
                  </FlexItem>
                )}
              </Flex>
            </FlexItem>
            {metrics && (
              <FlexItem>
                <span className={styles.tokensBadge}>{metrics}</span>
              </FlexItem>
            )}
          </Flex>
        </CardTitle>
      </CardHeader>
      <CardBody>
        <ExpandableSection
          toggleText={isExpanded ? 'Hide input' : 'Show input'}
          isExpanded={isExpanded}
          onToggle={(_e, expanded) => setIsExpanded(expanded)}
        >
          <NxCodeBlock enableCopy copyContent={inputJson}>
            {inputJson}
          </NxCodeBlock>
        </ExpandableSection>
        <NxDetailList>
          <NxDetail label="Request">{group.content}</NxDetail>
          <NxDetail label="Response">{group.toolOutput}</NxDetail>
        </NxDetailList>
      </CardBody>
    </Card>
  )
}

function FinalAnswerBlock({ step }: Readonly<{ step: AgentTraceStep }>) {
  const metrics = formatMetrics(step.tokens, step.duration_ms)
  return (
    <div className={styles.finalAnswerBlock}>
      <Content component={ContentVariants.small} className={styles.stepTypeLabel}>
        Final answer
      </Content>
      <Content component={ContentVariants.p}>{step.content}</Content>
      {metrics && <span className={styles.tokensBadge}>{metrics}</span>}
    </div>
  )
}

function StepRenderer({ item }: Readonly<{ item: AgentTraceStep | ToolCallGroup }>) {
  if (isToolCallGroup(item)) {
    return <ToolCallCard group={item} />
  }
  switch (item.type) {
    case 'reasoning':
      return <ReasoningBlock step={item} />
    case 'final_answer':
      return <FinalAnswerBlock step={item} />
    case 'tool_call':
    case 'tool_result':
      return null
  }
}

type AgentTraceViewProps = Readonly<{
  agentTrace: AgentTrace | null
  isLoading?: boolean
}>

export function AgentTraceView({ agentTrace, isLoading }: AgentTraceViewProps) {
  if (isLoading) {
    return <Spinner aria-label="Loading agent trace" />
  }

  if (!agentTrace || agentTrace.steps.length === 0) {
    return (
      <NxEmptyStateNoData
        title="No agent steps yet"
        description="No agent reasoning steps are available for this activity."
      />
    )
  }

  const groupedSteps = groupToolSteps(agentTrace.steps)

  return (
    <div className={styles.scrollContainer}>
      <HeaderBar trace={agentTrace} />
      <div className={styles.stepsList} role="log" aria-label="Agent reasoning steps">
        {groupedSteps.map((item) => {
          const key = isToolCallGroup(item) ? `tool-${item.callId ?? item.toolName}` : `${item.type}-${item.timestamp}`
          return <StepRenderer key={key} item={item} />
        })}
      </div>
    </div>
  )
}
