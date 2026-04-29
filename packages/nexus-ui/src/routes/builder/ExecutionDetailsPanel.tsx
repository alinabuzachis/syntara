import type { ExecutionsAPI } from '@ansible/nexus-contracts'
import {
  Alert,
  Content,
  ContentVariants,
  Divider,
  Flex,
  FlexItem,
  Stack,
  StackItem,
  Tab,
  Tabs,
  TabTitleText,
  Title,
  TitleSizes,
} from '@patternfly/react-core'
import type React from 'react'
import { useEffect, useState } from 'react'

import { executionsClient } from '../../client'
import { AppPanel } from '../../components/AppPanel'
import { useQueryState } from '../../components/states/useQueryState'
import { useElapsedTime } from '../../hooks/useElapsedTime'
import { formatExecutionDateTime, formatElapsedTime } from '../../utils/dateUtils'
import { detachPromise } from '../../utils/detachPromise'
import { NodeExecutionDetailsPanel } from '../executions/NodeExecutionDetailsPanel'
import type { ActivityState } from '../workflows/execution/types'
import { useExecutionStore, useExecutionStoreActions } from '../workflows/stores/useExecutionStore'

import { CompactActivityList } from './CompactActivityList'
import { ExecutionActivityTable } from './ExecutionActivityTable'
import type { ActivityOrderItem } from './ExecutionActivityTable'
import { StatusLabel } from './ExecutionStatus'
import { useActivityNameMap, resolveNodeName, type WorkflowDefShape } from './useActivityNameMap'

export type { WorkflowDefShape } from './useActivityNameMap'

type ViewMode = 'overview' | 'details'

type ExecutionDetailsPanelProps = {
  executionId: string
  workflowDefinition?: WorkflowDefShape | null
  selectedNodeId?: string | null
  selectedNodeName?: string | null
  onDeselectNode?: () => void
  onNodeSelect?: (nodeId: string, nodeName: string) => void
}

type ExecutionStatus = ExecutionsAPI.components['schemas']['ExecutionStatus']

type HeaderMetadataProps = {
  execution: {
    started_at?: string | null
    created_at?: string | null
    completed_at?: string | null
    status?: ExecutionStatus | null
  }
  elapsedLabel?: string
  isRunning: boolean
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
}

function HeaderMetadata({
  execution,
  elapsedLabel,
  isRunning,
  viewMode,
  onViewModeChange,
}: Readonly<HeaderMetadataProps>) {
  const startDisplay = execution.started_at ?? execution.created_at

  return (
    <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
      <FlexItem>
        <Flex gap={{ default: 'gapLg' }} alignItems={{ default: 'alignItemsCenter' }}>
          <FlexItem>
            <Title headingLevel="h2" size={TitleSizes.md} style={{ margin: 0 }}>
              {isRunning ? 'Current run details' : 'Run details'}
            </Title>
          </FlexItem>
          <FlexItem>
            <Tabs activeKey={viewMode} onSelect={(_e, key) => onViewModeChange(key as ViewMode)} variant="secondary">
              <Tab eventKey="overview" title={<TabTitleText>Overview</TabTitleText>} />
              <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>} />
            </Tabs>
          </FlexItem>
        </Flex>
      </FlexItem>
      <FlexItem>
        <Flex gap={{ default: 'gapMd' }} alignItems={{ default: 'alignItemsCenter' }}>
          {startDisplay && (
            <Content
              component={ContentVariants.small}
              style={{ color: 'var(--pf-t--global--text--color--subtle)', margin: 0 }}
            >
              {formatExecutionDateTime(startDisplay)}
              {execution.completed_at && ` - ${formatExecutionDateTime(execution.completed_at)}`}
            </Content>
          )}
          {elapsedLabel && (
            <Content
              component={ContentVariants.small}
              style={{ color: 'var(--pf-t--global--text--color--subtle)', margin: 0 }}
            >
              Elapsed time: {elapsedLabel}
            </Content>
          )}
          {execution.status && (
            <FlexItem style={{ display: 'flex', alignItems: 'center' }}>
              <StatusLabel status={execution.status} />
            </FlexItem>
          )}
        </Flex>
      </FlexItem>
    </Flex>
  )
}

function NoSelectionState() {
  return (
    <Flex
      justifyContent={{ default: 'justifyContentCenter' }}
      alignItems={{ default: 'alignItemsCenter' }}
      style={{ height: '100%' }}
    >
      <Content component={ContentVariants.p} style={{ color: 'var(--pf-t--global--text--color--subtle)' }}>
        Select a step from the list or canvas to view its input and output data.
      </Content>
    </Flex>
  )
}

type ThreePanelLayoutProps = {
  execution: {
    started_at?: string | null
    created_at?: string | null
    completed_at?: string | null
    status?: ExecutionStatus | null
  }
  elapsedLabel?: string
  isRunning: boolean
  activityStates: Map<string, ActivityState>
  activityOrder: ActivityOrderItem[]
  selectedNodeId: string | null
  displayNodeName: string | null
  executionId: string
  selectedNodeState?: ActivityState
  onDeselectNode: () => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  onRowClick?: (nodeId: string, nodeName: string) => void
}

function ThreePanelLayout({
  execution,
  elapsedLabel,
  isRunning,
  activityStates,
  activityOrder,
  selectedNodeId,
  displayNodeName,
  executionId,
  selectedNodeState,
  onDeselectNode,
  viewMode,
  onViewModeChange,
  onRowClick,
}: Readonly<ThreePanelLayoutProps>) {
  return (
    <AppPanel
      hasNoPadding
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
      <div style={{ flexShrink: 0, padding: 'var(--pf-t--global--spacer--md)', paddingBottom: 0 }}>
        <HeaderMetadata
          execution={execution}
          elapsedLabel={elapsedLabel}
          isRunning={isRunning}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
        />
      </div>
      <Flex
        flexWrap={{ default: 'nowrap' }}
        alignItems={{ default: 'alignItemsStretch' }}
        style={{ flex: 1, minHeight: 0, overflow: 'hidden', gap: 0 }}
      >
        <FlexItem flex={{ default: 'flex_1' }} style={{ minWidth: 0, overflow: 'hidden' }}>
          <Stack style={{ height: '100%', overflow: 'hidden', padding: 'var(--pf-t--global--spacer--md)' }}>
            <StackItem isFilled style={{ minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
              <CompactActivityList
                activityStates={activityStates}
                activityOrder={activityOrder}
                onRowClick={onRowClick}
                selectedNodeId={selectedNodeId}
              />
            </StackItem>
          </Stack>
        </FlexItem>

        <Divider orientation={{ default: 'vertical' }} />

        <FlexItem
          flex={{ default: 'flex_2' }}
          style={{ minWidth: 0, overflow: 'hidden', padding: 'var(--pf-t--global--spacer--md)' }}
        >
          {selectedNodeId && displayNodeName ? (
            <NodeExecutionDetailsPanel
              nodeId={selectedNodeId}
              nodeName={displayNodeName}
              executionId={executionId}
              nodeState={selectedNodeState}
              onClose={onDeselectNode}
            />
          ) : (
            <NoSelectionState />
          )}
        </FlexItem>
      </Flex>
    </AppPanel>
  )
}

type SinglePanelLayoutProps = {
  execution: {
    started_at?: string | null
    created_at?: string | null
    completed_at?: string | null
    status?: ExecutionStatus | null
    error_details?: string | null
  }
  elapsedLabel?: string
  isRunning: boolean
  activityStates: Map<string, ActivityState>
  activityOrder: ActivityOrderItem[]
  now: number
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  onRowClick?: (nodeId: string, nodeName: string) => void
  selectedNodeId?: string | null
}

function SinglePanelLayout({
  execution,
  elapsedLabel,
  isRunning,
  activityStates,
  activityOrder,
  now,
  viewMode,
  onViewModeChange,
  onRowClick,
  selectedNodeId,
}: Readonly<SinglePanelLayoutProps>) {
  return (
    <AppPanel
      hasNoPadding
      isFullHeight
      style={{
        height: '100%',
        maxHeight: '100%',
        width: '100%',
        flexShrink: 0,
      }}
    >
      <Stack style={{ height: '100%', overflow: 'hidden', padding: 'var(--pf-t--global--spacer--md)' }}>
        <StackItem style={{ flexShrink: 0, paddingBottom: 'var(--pf-t--global--spacer--md)' }}>
          <HeaderMetadata
            execution={execution}
            elapsedLabel={elapsedLabel}
            isRunning={isRunning}
            viewMode={viewMode}
            onViewModeChange={onViewModeChange}
          />
        </StackItem>

        {execution.status === 'failed' && execution.error_details && (
          <StackItem style={{ flexShrink: 0, paddingBottom: 'var(--pf-t--global--spacer--sm)' }}>
            <Alert variant="danger" isInline isPlain title="Execution failed">
              <span style={{ color: 'var(--pf-t--global--color--status--danger--default)' }}>
                {execution.error_details}
              </span>
            </Alert>
          </StackItem>
        )}

        <StackItem isFilled style={{ minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
          <ExecutionActivityTable
            activityStates={activityStates}
            activityOrder={activityOrder}
            now={now}
            executionError={execution.error_details}
            onRowClick={onRowClick}
            selectedNodeId={selectedNodeId}
          />
        </StackItem>
      </Stack>
    </AppPanel>
  )
}

function LoadingErrorState({ queryState }: Readonly<{ queryState: React.ReactNode }>) {
  return (
    <AppPanel
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
          <Title headingLevel="h2" size={TitleSizes.lg}>
            Current run details
          </Title>
        </StackItem>
        <StackItem isFilled style={{ padding: 'var(--pf-t--global--spacer--lg)' }}>
          {queryState}
        </StackItem>
      </Stack>
    </AppPanel>
  )
}

export function ExecutionDetailsPanel({
  executionId,
  workflowDefinition,
  selectedNodeId,
  selectedNodeName: selectedNodeNameProp,
  onDeselectNode,
  onNodeSelect,
}: Readonly<ExecutionDetailsPanelProps>) {
  const { setActivityExecutions } = useExecutionStoreActions()
  const activityStates = useExecutionStore((s) => s.activityStates)
  const [viewMode, setViewMode] = useState<ViewMode>('overview')

  const executionQuery = executionsClient.useQuery('get', '/executions/{execution_id}', {
    params: {
      path: { execution_id: executionId },
      query: { include: 'activities' },
    },
  })

  const execution = executionQuery.data
  const executionStatus = execution?.status
  const isRunning = executionStatus === 'running' || executionStatus === 'pending'
  const startedAtValue = execution?.started_at ?? execution?.created_at ?? null

  const { elapsedMs, now } = useElapsedTime(startedAtValue, execution?.completed_at, isRunning)
  const elapsedLabel = elapsedMs !== undefined ? formatElapsedTime(elapsedMs) : undefined

  useEffect(() => {
    setActivityExecutions(execution?.activities ?? [])
  }, [execution?.activities, setActivityExecutions])

  const { nameMap, activityOrder } = useActivityNameMap(workflowDefinition, activityStates)

  const resolvedNodeId = selectedNodeId ?? null
  const displayNodeName = selectedNodeNameProp ?? resolveNodeName(nameMap, selectedNodeId) ?? null
  const selectedNodeState = selectedNodeId ? activityStates.get(selectedNodeId) : undefined
  const deselectHandler = onDeselectNode ?? (() => {})

  const handleRowClick = (nodeId: string, nodeName: string) => {
    onNodeSelect?.(nodeId, nodeName)
  }

  const queryState = useQueryState(executionQuery, {
    title: 'Error loading execution',
    onRetry: () => detachPromise(executionQuery.refetch()),
  })

  if (queryState || !execution) {
    return <LoadingErrorState queryState={queryState} />
  }

  if (viewMode === 'details') {
    return (
      <ThreePanelLayout
        execution={execution}
        elapsedLabel={elapsedLabel}
        isRunning={isRunning}
        activityStates={activityStates}
        activityOrder={activityOrder}
        selectedNodeId={resolvedNodeId}
        displayNodeName={displayNodeName}
        executionId={executionId}
        selectedNodeState={selectedNodeState}
        onDeselectNode={deselectHandler}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onRowClick={handleRowClick}
      />
    )
  }

  return (
    <SinglePanelLayout
      execution={execution}
      elapsedLabel={elapsedLabel}
      isRunning={isRunning}
      activityStates={activityStates}
      activityOrder={activityOrder}
      now={now}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      onRowClick={handleRowClick}
      selectedNodeId={resolvedNodeId}
    />
  )
}
