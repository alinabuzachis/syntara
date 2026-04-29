import type { ExecutionsAPI } from '@ansible/nexus-contracts'
import {
  Alert,
  Content,
  ContentVariants,
  Flex,
  FlexItem,
  Stack,
  StackItem,
  Title,
  TitleSizes,
} from '@patternfly/react-core'
import { useEffect, useMemo } from 'react'

import { AppPageMain } from '../../app/AppPage'
import { executionsClient } from '../../client'
import { AppPanel } from '../../components/AppPanel'
import { useQueryState } from '../../components/states/useQueryState'
import { useElapsedTime } from '../../hooks/useElapsedTime'
import { formatExecutionDateTime, formatElapsedTime } from '../../utils/dateUtils'
import { detachPromise } from '../../utils/detachPromise'
import { useExecutionStore, useExecutionStoreActions } from '../workflows/stores/useExecutionStore'

import { ExecutionActivityTable } from './ExecutionActivityTable'
import type { ActivityOrderItem, TriggerItem } from './ExecutionActivityTable'
import { StatusLabel } from './ExecutionStatus'

type ActivityLike = {
  id?: string
  name?: string
  branches?: (ActivityLike[] | ActivityLike | string)[]
  steps?: ActivityLike[]
  then?: ActivityLike[]
  else?: ActivityLike[]
  loop?: { do?: ActivityLike[] }
  converge?: { branches?: string[] }
}

type TriggerLike = {
  type?: string
  name?: string
}

export type WorkflowDefShape = {
  triggers?: TriggerLike[]
  workflow?: { activities?: ActivityLike[] }
}

type ExecutionDetailsPanelProps = {
  executionId: string
  /** Workflow definition used to look up human-readable activity names. */
  workflowDefinition?: WorkflowDefShape | null
}

const CHILD_KEYS: (keyof ActivityLike)[] = ['steps', 'then', 'else']

/** Normalize branches to ActivityLike[][] — parallel has objects/arrays, converge has strings (skipped). */
function normalizeBranches(branches: (ActivityLike[] | ActivityLike | string)[]): ActivityLike[][] {
  return branches
    .filter((b): b is ActivityLike[] | ActivityLike => typeof b !== 'string')
    .map((b) => (Array.isArray(b) ? b : [b]))
}

function collectNamesFromActivityList(acts: ActivityLike[], map: Map<string, string>): void {
  for (const act of acts) {
    collectNamesFromActivity(act, map)
  }
}

function collectNamesFromActivity(act: ActivityLike, map: Map<string, string>): void {
  if (act.id && act.name) map.set(act.id, act.name)

  if (act.branches) {
    for (const branch of normalizeBranches(act.branches)) {
      collectNamesFromActivityList(branch, map)
    }
  }

  for (const key of CHILD_KEYS) {
    const children = act[key]
    if (Array.isArray(children)) {
      collectNamesFromActivityList(children as ActivityLike[], map)
    }
  }

  if (act.loop?.do) {
    collectNamesFromActivityList(act.loop.do, map)
  }
}

function buildNameMap(activities: ActivityLike[] | undefined): Map<string, string> {
  const map = new Map<string, string>()
  if (!activities) return map

  collectNamesFromActivityList(activities, map)
  return map
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
}

function HeaderMetadata({ execution, elapsedLabel, isRunning }: HeaderMetadataProps) {
  const startDisplay = execution.started_at ?? execution.created_at

  return (
    <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
      <FlexItem>
        <Title headingLevel="h2" size={TitleSizes.md} style={{ margin: 0 }}>
          {isRunning ? 'Current run details' : 'Run details'}
        </Title>
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

/**
 * Panel displaying per-activity execution state as a table, with
 * overall execution metadata (start time, elapsed, status) in the header.
 */
export function ExecutionDetailsPanel({ executionId, workflowDefinition }: ExecutionDetailsPanelProps) {
  const { setActivityExecutions } = useExecutionStoreActions()
  const activityStates = useExecutionStore((s) => s.activityStates)

  // Fetch execution details with activities included
  const executionQuery = executionsClient.useQuery('get', '/executions/{execution_id}', {
    params: {
      path: { execution_id: executionId },
      query: { include: 'activities' },
    },
  })

  const execution = executionQuery.data
  const isRunning = execution?.status === 'running' || execution?.status === 'pending'
  const startedAtValue = execution?.started_at ?? execution?.created_at ?? null

  // Shared 1-second ticker for header elapsed time and per-row elapsed
  const { elapsedMs, now } = useElapsedTime(startedAtValue, execution?.completed_at, isRunning ?? false)
  const elapsedLabel = elapsedMs !== undefined ? formatElapsedTime(elapsedMs) : undefined

  // Sync activities into the execution store (always call to clear stale rows on execution change)
  useEffect(() => {
    setActivityExecutions(execution?.activities ?? [])
  }, [execution?.activities, setActivityExecutions])

  // Build activity name map and trigger list from workflow definition
  const nameMap = useMemo(
    () => buildNameMap(workflowDefinition?.workflow?.activities),
    [workflowDefinition?.workflow?.activities]
  )

  const triggers = useMemo<TriggerItem[]>(
    () =>
      (workflowDefinition?.triggers ?? []).map((t, i) => ({
        index: i,
        type: t.type ?? 'manual',
        name: t.name,
      })),
    [workflowDefinition?.triggers]
  )

  // Ordered activity list derived from store insertion order (= API/WebSocket order)
  const activityOrder = useMemo<ActivityOrderItem[]>(
    () => Array.from(activityStates.keys()).map((id) => ({ id, name: nameMap.get(id) })),
    [activityStates, nameMap]
  )

  const queryState = useQueryState(executionQuery, {
    title: 'Error loading execution',
    onRetry: () => detachPromise(executionQuery.refetch()),
  })

  if (queryState || !execution) {
    return (
      <AppPanel
        isFullHeight
        style={{
          height: '100%',
          maxHeight: '100%',
          width: '24rem',
          flexShrink: 0,
        }}
      >
        <Stack>
          <StackItem style={{ padding: 'var(--pf-t--global--spacer--lg)' }}>
            <Title headingLevel="h2" size={TitleSizes.lg}>
              Current run details
            </Title>
          </StackItem>
          <AppPageMain style={{ padding: 'var(--pf-t--global--spacer--lg)' }}>{queryState}</AppPageMain>
        </Stack>
      </AppPanel>
    )
  }

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
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <Stack style={{ height: '100%', minHeight: 0, padding: 'var(--pf-t--global--spacer--md)' }}>
          {/* Header: title left, execution metadata right */}
          <StackItem style={{ flexShrink: 0, paddingBottom: 'var(--pf-t--global--spacer--md)' }}>
            <HeaderMetadata execution={execution} elapsedLabel={elapsedLabel} isRunning={isRunning} />
          </StackItem>

          {/* Execution-level error banner */}
          {execution.status === 'failed' && execution.error_details && (
            <StackItem style={{ flexShrink: 0, paddingBottom: 'var(--pf-t--global--spacer--sm)' }}>
              <Alert variant="danger" isInline isPlain title="Execution failed">
                <span style={{ color: 'var(--pf-t--global--color--status--danger--default)' }}>
                  {execution.error_details}
                </span>
              </Alert>
            </StackItem>
          )}

          {/* Scrollable activity table */}
          <AppPageMain style={{ overflowY: 'auto', overflowX: 'hidden' }}>
            <ExecutionActivityTable
              triggers={triggers}
              activityStates={activityStates}
              activityOrder={activityOrder}
              executionStartedAt={startedAtValue}
              now={now}
              executionError={execution.error_details}
            />
          </AppPageMain>
        </Stack>
      </div>
    </AppPanel>
  )
}
