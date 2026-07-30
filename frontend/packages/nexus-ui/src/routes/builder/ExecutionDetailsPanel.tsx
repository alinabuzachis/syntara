import { Alert, Divider, Flex, FlexItem, Stack, StackItem } from '@patternfly/react-core'
import type { ThProps } from '@patternfly/react-table'
import type { ExecutionsAPI } from '@syntara/contracts'
import { useEffect, useMemo, useRef, useState } from 'react'

import { executionsClient } from '../../client'
import { FilterBar } from '../../components/filters/FilterBar'
import { NxPanel } from '../../components/layout/NxPanel'
import { NxEmptyStateFilter } from '../../components/states/NxEmptyStateFilter'
import { useQueryState } from '../../components/states/useQueryState'
import { useElapsedTime } from '../../hooks/useElapsedTime'
import { useSortableTable } from '../../hooks/useSortableTable'
import type { FilterConfig } from '../../types/filters'
import { formatElapsedTime } from '../../utils/dateUtils'
import { detachPromise } from '../../utils/detachPromise'
import { NodeExecutionDetailsPanel } from '../executions/NodeExecutionDetailsPanel'
import type { ActivityState } from '../workflows/execution/types'
import {
  useExecutionStore,
  useExecutionStoreActions,
  useExecutionWithLiveStatus,
  type ExecutionMetadata,
} from '../workflows/stores/useExecutionStore'

import { ACTIVITY_FILTER_DEFINITIONS } from './activityFilterDefinitions'
import { CompactActivityList } from './CompactActivityList'
import { ExecutionActivityTable } from './ExecutionActivityTable'
import type { ActivityOrderItem } from './ExecutionActivityTable'
import {
  ACTIVITY_SORT_PARAM,
  executionActivityDefaultSort,
  executionActivityTableColumns,
} from './executionActivityTableColumns'
import styles from './ExecutionDetailsPanel.module.css'
import { HeaderMetadata, LoadingErrorState, NoSelectionState, type ViewMode } from './ExecutionDetailsPanelHeader'
import { sortExecutionActivities } from './sortExecutionActivities'
import { useActivityFilters } from './useActivityFilters'
import { useActivityNameMap, resolveNodeName, type WorkflowDefShape } from './useActivityNameMap'

export type { WorkflowDefShape } from './useActivityNameMap'

type ExecutionStatus = ExecutionsAPI.components['schemas']['ExecutionStatus']

const ACTIVE_STATUSES = new Set<ExecutionStatus>(['running', 'pending', 'paused'])

type ExecutionDetailsPanelProps = {
  executionId: string
  workflowDefinition?: WorkflowDefShape | null
  selectedNodeId?: string | null
  selectedNodeName?: string | null
  onNodeSelect?: (nodeId: string, nodeName: string) => void
  headerLabel?: string
  onClosePanel?: () => void
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
  hasFilteredOutActivities: boolean
  showFilters: boolean
  filters: FilterConfig[]
  onFilterChange: (filters: FilterConfig[]) => void
  selectedNodeId: string | null
  displayNodeName: string | null
  executionId: string
  selectedNodeState?: ActivityState
  selectedNodeType?: string
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  onRowClick?: (nodeId: string, nodeName: string) => void
  headerLabel?: string
  onClosePanel?: () => void
}

function ThreePanelLayout({
  execution,
  elapsedLabel,
  isRunning,
  activityStates,
  activityOrder,
  hasFilteredOutActivities,
  showFilters,
  filters,
  onFilterChange,
  selectedNodeId,
  displayNodeName,
  executionId,
  selectedNodeState,
  selectedNodeType,
  viewMode,
  onViewModeChange,
  onRowClick,
  headerLabel,
  onClosePanel,
}: Readonly<ThreePanelLayoutProps>) {
  return (
    <NxPanel
      hasNoPadding
      isFullHeight
      style={{
        height: '100%',
        maxHeight: '100%',
        width: '100%',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      <div className={styles.header}>
        <HeaderMetadata
          execution={execution}
          elapsedLabel={elapsedLabel}
          isRunning={isRunning}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          headerLabel={headerLabel}
          onClosePanel={onClosePanel}
        />
      </div>
      <Flex
        flexWrap={{ default: 'nowrap' }}
        alignItems={{ default: 'alignItemsStretch' }}
        gap={{ default: 'gapNone' }}
        className={styles.contentFlex}
      >
        <FlexItem className={styles.activityList}>
          {showFilters && (
            <section className={styles.filterBarWrapper} aria-label="Activity filter">
              <FilterBar
                fieldDefinitions={ACTIVITY_FILTER_DEFINITIONS}
                filters={filters}
                onFilterChange={onFilterChange}
                isCompact
              />
            </section>
          )}
          <div className={styles.activityListScrollWrapper}>
            {activityOrder.length === 0 && hasFilteredOutActivities ? (
              <NxEmptyStateFilter clearAllFilters={() => onFilterChange([])} />
            ) : (
              <CompactActivityList
                activityStates={activityStates}
                activityOrder={activityOrder}
                onRowClick={onRowClick}
                selectedNodeId={selectedNodeId}
              />
            )}
          </div>
        </FlexItem>

        <Divider orientation={{ default: 'vertical' }} />

        <FlexItem flex={{ default: 'flex_1' }} className={styles.nodeDetailsPane}>
          {selectedNodeId && displayNodeName ? (
            <NodeExecutionDetailsPanel
              nodeId={selectedNodeId}
              nodeName={displayNodeName}
              executionId={executionId}
              nodeState={selectedNodeState}
              nodeType={selectedNodeType}
            />
          ) : (
            <NoSelectionState />
          )}
        </FlexItem>
      </Flex>
    </NxPanel>
  )
}

function resolveErrorDetails(errorDetails: string | null | undefined, nameMap: Map<string, string>): string | null {
  if (!errorDetails || nameMap.size === 0) return errorDetails ?? null
  let resolved = errorDetails
  for (const [id, name] of nameMap) {
    resolved = resolved.replaceAll(`${id}: `, `${name}: `)
  }
  return resolved
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
  nameMap: Map<string, string>
  hasFilteredOutActivities: boolean
  showFilters: boolean
  filters: FilterConfig[]
  onFilterChange: (filters: FilterConfig[]) => void
  now: number
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  onRowClick?: (nodeId: string, nodeName: string) => void
  selectedNodeId?: string | null
  headerLabel?: string
  onClosePanel?: () => void
  getSortParams?: (columnField: string) => ThProps['sort']
}

function SinglePanelLayout({
  execution,
  elapsedLabel,
  isRunning,
  activityStates,
  activityOrder,
  nameMap,
  hasFilteredOutActivities,
  showFilters,
  filters,
  onFilterChange,
  now,
  viewMode,
  onViewModeChange,
  onRowClick,
  selectedNodeId,
  headerLabel,
  onClosePanel,
  getSortParams,
}: Readonly<SinglePanelLayoutProps>) {
  const resolvedError = useMemo(
    () => resolveErrorDetails(execution.error_details, nameMap),
    [execution.error_details, nameMap]
  )
  return (
    <NxPanel
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
            headerLabel={headerLabel}
            onClosePanel={onClosePanel}
          />
        </StackItem>

        {showFilters && (
          <StackItem className={styles.filterBarWrapper}>
            <section aria-label="Activity filter">
              <FilterBar
                fieldDefinitions={ACTIVITY_FILTER_DEFINITIONS}
                filters={filters}
                onFilterChange={onFilterChange}
                isCompact
              />
            </section>
          </StackItem>
        )}

        {execution.status === 'failed' && resolvedError && (
          <StackItem style={{ flexShrink: 0, paddingBottom: 'var(--pf-t--global--spacer--sm)' }}>
            <Alert variant="danger" isInline isPlain title="Execution failed">
              {resolvedError}
            </Alert>
          </StackItem>
        )}

        <StackItem isFilled style={{ minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
          {activityOrder.length === 0 && hasFilteredOutActivities ? (
            <NxEmptyStateFilter clearAllFilters={() => onFilterChange([])} />
          ) : (
            <ExecutionActivityTable
              activityStates={activityStates}
              activityOrder={activityOrder}
              now={now}
              executionError={resolvedError}
              onRowClick={onRowClick}
              selectedNodeId={selectedNodeId}
              getSortParams={getSortParams}
            />
          )}
        </StackItem>
      </Stack>
    </NxPanel>
  )
}

export function ExecutionDetailsPanel({
  executionId,
  workflowDefinition,
  selectedNodeId,
  selectedNodeName: selectedNodeNameProp,
  onNodeSelect,
  headerLabel,
  onClosePanel,
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

  const execution = useExecutionWithLiveStatus(executionQuery.data)
  const isRunning = execution?.status != null && ACTIVE_STATUSES.has(execution.status)
  const startedAtValue = execution?.created_at ?? null

  const { elapsedMs, now } = useElapsedTime(startedAtValue, execution?.completed_at, isRunning)
  const elapsedLabel = elapsedMs !== undefined ? formatElapsedTime(elapsedMs) : undefined

  const activities = execution?.activities
  const executionMetadata = (execution as { execution_metadata?: ExecutionMetadata } | undefined)?.execution_metadata

  const { injectPreResolvedStates, setExecutionMetadata } = useExecutionStore.getState()

  useEffect(() => {
    if (activities) {
      setActivityExecutions(activities)
    }

    // Pre-resolved nodes may not have ActivityExecution records yet (backend race).
    // Inject SKIPPED states for any that are missing from the activity list.
    const preResolved = executionMetadata?.pre_resolved_nodes
    if (preResolved) {
      const existingIds = new Set((activities ?? []).map((a) => a.activity_id))
      const missing = Object.keys(preResolved).filter((id) => !existingIds.has(id))
      injectPreResolvedStates(missing)
    }

    setExecutionMetadata(executionMetadata ?? null)
  }, [activities, executionMetadata, setActivityExecutions, injectPreResolvedStates, setExecutionMetadata])

  const { nameMap, activityOrder } = useActivityNameMap(workflowDefinition, activityStates)

  const { filters, filteredActivityOrder, handleFilterChange, hasActiveFilters } = useActivityFilters(
    activityOrder,
    activityStates
  )

  const { sort, getSortParams } = useSortableTable(executionActivityTableColumns, executionActivityDefaultSort, {
    paramName: ACTIVITY_SORT_PARAM,
  })

  // Keep a live clock ref for duration sort, but do not list `now` as a memo dep.
  // Depending on the 1s tick would re-sort (new array) every second, and duration
  // sort would reshuffle running rows as elapsed times cross. Live elapsed still
  // updates in the table via the `now` prop; row order freezes until order/states/sort change.
  const nowRef = useRef(now)
  nowRef.current = now
  const sortedActivityOrder = useMemo(() => {
    const sortNow = sort?.field === 'duration' ? nowRef.current : 0
    return sortExecutionActivities(filteredActivityOrder, activityStates, sort, sortNow)
  }, [filteredActivityOrder, activityStates, sort])

  const hasFilteredOutActivities = hasActiveFilters && activityOrder.length > 0
  const showFilters = activityOrder.length > 0 || hasActiveFilters

  const resolvedNodeId = selectedNodeId ?? null
  const displayNodeName = selectedNodeNameProp ?? resolveNodeName(nameMap, selectedNodeId) ?? null
  const selectedNodeState = selectedNodeId ? activityStates.get(selectedNodeId) : undefined
  const selectedNodeType = selectedNodeId ? activityOrder.find((a) => a.id === selectedNodeId)?.type : undefined

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
        activityOrder={sortedActivityOrder}
        hasFilteredOutActivities={hasFilteredOutActivities}
        showFilters={showFilters}
        filters={filters}
        onFilterChange={handleFilterChange}
        selectedNodeId={resolvedNodeId}
        displayNodeName={displayNodeName}
        executionId={executionId}
        selectedNodeState={selectedNodeState}
        selectedNodeType={selectedNodeType}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onRowClick={handleRowClick}
        headerLabel={headerLabel}
        onClosePanel={onClosePanel}
      />
    )
  }

  return (
    <SinglePanelLayout
      execution={execution}
      elapsedLabel={elapsedLabel}
      isRunning={isRunning}
      activityStates={activityStates}
      activityOrder={sortedActivityOrder}
      nameMap={nameMap}
      hasFilteredOutActivities={hasFilteredOutActivities}
      showFilters={showFilters}
      filters={filters}
      onFilterChange={handleFilterChange}
      now={now}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      onRowClick={handleRowClick}
      selectedNodeId={resolvedNodeId}
      headerLabel={headerLabel}
      onClosePanel={onClosePanel}
      getSortParams={getSortParams}
    />
  )
}
