import type { ExecutionsAPI } from '@ansible/nexus-contracts'
import {
  Alert,
  AlertActionCloseButton,
  Content,
  ContentVariants,
  Flex,
  FlexItem,
  TitleSizes,
} from '@patternfly/react-core'
import { useQueryClient } from '@tanstack/react-query'
import type React from 'react'
import '@xyflow/react/dist/style.css'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useParams, useSearch } from 'wouter'

import { executionsClient } from '../../client'
import { NxPage, NxPageBody } from '../../components/layout/NxPage'
import { NxPageHeader } from '../../components/layout/NxPageHeader'
import { NxPanel } from '../../components/layout/NxPanel'
import { ResizableDivider } from '../../components/ResizableDivider'
import { ErrorState } from '../../components/states/ErrorState'
import { LoadingState } from '../../components/states/LoadingState'
import type { FilterConfig } from '../../types/filters'
import { detachPromise } from '../../utils/detachPromise'
import { buildFilterParams } from '../../utils/filterUtils'
import { ExecutionDetailsPanel, type WorkflowDefShape } from '../builder/ExecutionDetailsPanel'
import { ExecutionViewContent } from '../builder/ExecutionViewContent'
import { WorkflowHistoryCard } from '../builder/WorkflowHistoryCard'
import { useExecutionWebSocket } from '../workflows/hooks/useExecutionWebSocket'
import { useExecutionStore } from '../workflows/stores/useExecutionStore'

import { ApprovalReviewView } from './ApprovalReviewView'
import { ConnectionBanner } from './ConnectionBanner'
import { isExecutionCancellable } from './executionCancellable'
import { ExecutionDetailHeaderToolbar, ExecutionDetailTitleRowAddons } from './ExecutionDetailPageHeaderParts'
import { executionDetailHasTitleRowExtras, executionDetailPageHeading } from './executionDetailPageHeaderTitle'
import { useExecutionNodeClick } from './hooks/useExecutionNodeClick'

/** Width constraint for the inline failure alert floating over the execution canvas. */
const INLINE_ALERT_WIDTH = 'clamp(15rem, 20vw, 22rem)'

type Execution = ExecutionsAPI.components['schemas']['ExecutionRead']
type ActivityData = ExecutionsAPI.components['schemas']['ActivityData']
type ActivityExecution = ExecutionsAPI.components['schemas']['ActivityExecution']

type WorkflowDefinitionLike = {
  metadata?: { name?: string; description?: string }
  nodes?: Array<{ id: string; name?: string }>
  workflow?: { activities?: Array<{ id: string; name?: string }> }
  triggers?: unknown[]
}

type ExecutionWorkflow = {
  id: string
  name: string
  description?: string
  version: { workflow_definition: WorkflowDefShape | null }
}

// Inner component that has access to React Flow context
function ExecutionDetailContent({
  historyCardOpen,
  workflow,
  execution,
  activities,
  executionId,
  executionsQuery,
  searchParams,
  setLocation,
  filters,
  onFilterChange,
  onNodeClick,
  selectedNodeId,
  selectedNodeName,
  onNodeSelect,
  onDeselectNode,
}: {
  historyCardOpen: boolean
  workflow?: ExecutionWorkflow
  execution: Execution | undefined
  activities: (ActivityData | ActivityExecution)[]
  executionId: string
  executionsQuery: {
    data?: { resources?: Execution[] }
    isLoading: boolean
    error: unknown
    refetch: () => Promise<unknown>
  }
  searchParams: string
  setLocation: (path: string) => void
  filters: FilterConfig[]
  onFilterChange: (filters: FilterConfig[]) => void
  onNodeClick?: (event: React.MouseEvent, node: { id: string; type?: string; data: Record<string, unknown> }) => void
  selectedNodeId: string | null
  selectedNodeName: string | null
  onNodeSelect: (nodeId: string, nodeName: string) => void
  onDeselectNode: () => void
}) {
  const isStale = useExecutionStore((state) => state.isStale)
  const isComplete = useExecutionStore((state) => state.isComplete)
  const showFailureAlert = execution?.status === 'failed'
  const [alertDismissed, setAlertDismissed] = useState(false)
  const [panelHeight, setPanelHeight] = useState(300)

  const MIN_PANEL_HEIGHT = 100
  const MAX_PANEL_HEIGHT = 600

  const handleResize = useCallback((deltaY: number) => {
    setPanelHeight((prev) => Math.min(MAX_PANEL_HEIGHT, Math.max(MIN_PANEL_HEIGHT, prev - deltaY)))
  }, [])

  const panelHeightPercent = Math.round(
    ((panelHeight - MIN_PANEL_HEIGHT) / (MAX_PANEL_HEIGHT - MIN_PANEL_HEIGHT)) * 100
  )

  return (
    <Flex
      alignItems={{ default: 'alignItemsStretch' }}
      flexWrap={{ default: 'nowrap' }}
      gap={{ default: 'gapLg' }}
      style={{
        position: 'relative',
        minWidth: 0,
        height: '100%',
        overflow: 'visible',
        display: 'flex',
        flexDirection: 'row',
      }}
    >
      <FlexItem
        style={{
          position: 'relative',
          minWidth: 0,
          flexGrow: 1,
          height: '100%',
        }}
      >
        {isStale && !isComplete && (
          <Flex
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              zIndex: 10,
              padding: 'var(--pf-t--global--spacer--md)',
              pointerEvents: 'auto',
            }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <FlexItem fullWidth={{ default: 'fullWidth' }}>
              <ConnectionBanner isVisible />
            </FlexItem>
          </Flex>
        )}
        {showFailureAlert && !alertDismissed && (
          <div
            style={{
              position: 'absolute',
              top: 'var(--pf-t--global--spacer--md)',
              right: 0,
              zIndex: 10,
              width: INLINE_ALERT_WIDTH,
            }}
          >
            {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- event-stopping layer to prevent clicks from propagating to canvas below */}
            <div
              style={{ pointerEvents: 'auto' }}
              onMouseDown={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <Alert
                variant="danger"
                title={`${workflow?.name ?? 'Automation'} run failed`}
                actionClose={<AlertActionCloseButton onClose={() => setAlertDismissed(true)} />}
              >
                <Content component={ContentVariants.p} style={{ margin: 0 }}>
                  View the run logs and copy to the editor to debug within the editor
                </Content>
              </Alert>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          {/* Workflow Canvas */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <ExecutionViewContent
              workflow={workflow}
              executionStatus={execution?.status ?? null}
              executionActivities={activities}
              executionId={executionId}
              onNodeClick={onNodeClick}
              selectedActivityId={selectedNodeId}
            />
          </div>

          <ResizableDivider onResize={handleResize} currentValue={panelHeightPercent} />

          {/* Execution Details Panel */}
          <div style={{ height: `${String(panelHeight)}px`, flexShrink: 0, overflow: 'hidden' }}>
            <ExecutionDetailsPanel
              executionId={executionId}
              workflowDefinition={workflow?.version.workflow_definition}
              selectedNodeId={selectedNodeId}
              selectedNodeName={selectedNodeName}
              onNodeSelect={onNodeSelect}
              onDeselectNode={onDeselectNode}
            />
          </div>
        </div>
      </FlexItem>

      {/* History Card Panel */}
      {historyCardOpen && (
        <FlexItem style={{ flexShrink: 0, alignSelf: 'stretch' }}>
          <WorkflowHistoryCard
            executions={executionsQuery.data?.resources ?? []}
            selectedExecutionId={executionId}
            onClose={() => {
              const params = new URLSearchParams(searchParams)
              params.set('history', 'closed')
              setLocation(`/executions/${executionId}?${params.toString()}`)
            }}
            onExecutionSelect={(selectedId) => {
              // Preserve history panel state when navigating to different execution
              const params = new URLSearchParams(searchParams)
              const newSearch = params.toString()
              const searchSuffix = newSearch ? `?${newSearch}` : ''
              setLocation(`/executions/${selectedId}${searchSuffix}`)
            }}
            filters={filters}
            onFilterChange={onFilterChange}
          />
        </FlexItem>
      )}
    </Flex>
  )
}

function useExecutionStreaming(executionId: string | undefined, execution: Execution | undefined) {
  const queryClient = useQueryClient()
  const shouldStream = execution?.status === 'running' || execution?.status === 'pending'
  useExecutionWebSocket(executionId ?? '', {
    enabled: shouldStream && !!executionId,
    onExecutionComplete: () => {
      detachPromise(
        Promise.all([
          queryClient.invalidateQueries({
            queryKey: ['get', '/executions/{execution_id}'],
          }),
          queryClient.invalidateQueries({
            queryKey: ['get', '/executions'],
          }),
        ])
      )
    },
  })
}

function useSyncActivityStore(execution: Execution | undefined, activities: (ActivityData | ActivityExecution)[]) {
  const { setActivityExecutions } = useExecutionStore.getState()
  useEffect(() => {
    if (activities.length > 0) {
      setActivityExecutions(activities)
    } else if (execution?.status === 'pending' || execution?.status === 'running') {
      const wfDef = execution?.workflow_definition as unknown as WorkflowDefinitionLike | undefined
      const workflowActivities = wfDef?.nodes ?? wfDef?.workflow?.activities
      if (workflowActivities) {
        const pendingActivities = workflowActivities.map((activity) => ({
          id: activity.id,
          created_at: '',
          updated_at: '',
          execution_id: execution.id,
          activity_name: activity.name ?? activity.id,
          temporal_activity_id: '',
          status: 'pending' as const,
          error_details: null,
          started_at: null,
          completed_at: null,
        })) as ActivityExecution[]
        setActivityExecutions(pendingActivities)
      }
    } else {
      setActivityExecutions([])
    }
  }, [activities, execution?.id, execution?.status, execution?.workflow_definition, setActivityExecutions])
}

export default function ExecutionDetail() {
  const params = useParams<{ executionId: string }>()
  const executionId = params.executionId
  const [, setLocation] = useLocation()
  const searchParams = useSearch()

  // Use execution store
  const { reset } = useExecutionStore.getState()

  // Reset execution store when executionId changes
  // This ensures WebSocket can reconnect for new executions
  useEffect(() => {
    if (executionId) {
      reset()
    }
  }, [executionId, reset])

  // Fetch execution with workflow_definition and activities included
  const executionQuery = executionsClient.useQuery('get', '/executions/{execution_id}', {
    params: {
      path: { execution_id: executionId ?? '' },
      query: {
        include: 'workflow_definition,activities',
      },
    },
    enabled: !!executionId,
  })

  const execution = executionQuery.data

  useExecutionStreaming(executionId, execution)

  // History panel is open by default; only closed when explicitly set via URL param
  const historyCardOpen = useMemo(() => {
    const params = new URLSearchParams(searchParams)
    return params.get('history') !== 'closed'
  }, [searchParams])

  const [executionFilters, setExecutionFilters] = useState<FilterConfig[]>([])

  // Fetch executions for this workflow
  const executionsQueryParams = useMemo(() => {
    const params: Record<string, unknown> = { workflow_id: execution?.workflow_id ?? '' }
    Object.assign(params, buildFilterParams(executionFilters))
    return params
  }, [execution?.workflow_id, executionFilters])

  const executionsQuery = executionsClient.useQuery(
    'get',
    '/executions',
    {
      params: { query: executionsQueryParams },
    },
    {
      enabled: !!execution?.workflow_id,
    }
  )

  const activities = useMemo((): (ActivityData | ActivityExecution)[] => {
    return execution?.activities ?? []
  }, [execution])

  useSyncActivityStore(execution, activities)

  // Build a workflow object from the execution's workflow_definition
  const workflow = useMemo(() => {
    if (!execution?.workflow_definition || !execution.workflow_id) return undefined

    const wfDef = execution.workflow_definition as unknown as WorkflowDefinitionLike
    return {
      id: execution.workflow_id,
      name: wfDef.metadata?.name ?? 'Workflow',
      description: wfDef.metadata?.description,
      version: {
        workflow_definition: execution.workflow_definition,
      },
    }
  }, [execution])

  // Map activity IDs to human-readable names from the workflow definition
  const activityNameMap = useMemo(() => {
    const wfDef = execution?.workflow_definition as unknown as Record<string, unknown> | undefined
    const map = new Map<string, string>()
    // v2 definitions use top-level `nodes`; v1 used `workflow.activities`
    const activities = (wfDef?.nodes ??
      (wfDef?.workflow as Record<string, unknown> | undefined)?.activities ??
      []) as Array<{ id: string; name?: string }>
    for (const activity of activities) {
      if (activity.name) map.set(activity.id, activity.name)
    }
    return map
  }, [execution?.workflow_definition])

  // Node click handling: approval detection + node details panel toggle
  const {
    pendingApproval,
    isApprovalLoading,
    clearPendingApproval,
    selectedNodeId,
    selectedNodeName,
    selectNode,
    deselectNode,
    handleNodeClick,
  } = useExecutionNodeClick(executionId)
  const [approvalViewOpen, setApprovalViewOpen] = useState(false)

  const isCancellable = isExecutionCancellable(execution?.status)

  // Guard against missing executionId
  if (!executionId) {
    return (
      <NxPage>
        <NxPageHeader title="Error" />
        <NxPageBody>
          <NxPanel isFullHeight>
            <ErrorState title="Invalid execution" message="No execution ID provided" />
          </NxPanel>
        </NxPageBody>
      </NxPage>
    )
  }

  // Show loading/error states
  if (executionQuery.error) {
    return (
      <NxPage>
        <NxPageHeader title="Error loading execution" />
        <NxPageBody>
          <NxPanel isFullHeight>
            <ErrorState
              title="Error loading execution"
              message={executionQuery.error}
              onRetry={() => detachPromise(executionQuery.refetch())}
            />
          </NxPanel>
        </NxPageBody>
      </NxPage>
    )
  }

  if (executionQuery.isLoading) {
    return (
      <NxPage>
        <NxPageHeader title="Loading execution" />
        <NxPageBody>
          <NxPanel isFullHeight>
            <LoadingState />
          </NxPanel>
        </NxPageBody>
      </NxPage>
    )
  }

  // Toggle history panel and update URL
  const toggleHistoryCard = () => {
    const params = new URLSearchParams(searchParams)
    params.set('history', historyCardOpen ? 'closed' : 'open')
    setLocation(`/executions/${executionId}?${params.toString()}`)
  }

  return (
    <NxPage>
      <NxPageHeader
        title={executionDetailPageHeading(execution, executionId)}
        titleProps={{ size: TitleSizes['2xl'] }}
        titleAddons={
          executionDetailHasTitleRowExtras(execution) ? (
            <ExecutionDetailTitleRowAddons execution={execution} />
          ) : undefined
        }
        toolbar={
          <ExecutionDetailHeaderToolbar
            showApprovalActionStrip={Boolean(pendingApproval ?? isApprovalLoading)}
            isApprovalLoading={isApprovalLoading}
            onReviewClick={() => {
              setApprovalViewOpen(true)
            }}
            historyCardOpen={historyCardOpen}
            onToggleHistory={toggleHistoryCard}
            onBackToEditor={() => {
              if (execution?.workflow_id) {
                setLocation(`/workflow-builder/${execution.workflow_id}`)
              }
            }}
            isCancellable={isCancellable}
            executionId={executionId}
          />
        }
      />
      <NxPageBody>
        {approvalViewOpen && pendingApproval ? (
          <ApprovalReviewView
            approval={pendingApproval}
            activityNameMap={activityNameMap}
            onClose={() => {
              setApprovalViewOpen(false)
              clearPendingApproval()
            }}
          />
        ) : (
          <ExecutionDetailContent
            key={executionId}
            historyCardOpen={historyCardOpen}
            workflow={workflow}
            execution={execution}
            activities={activities}
            executionId={executionId}
            executionsQuery={executionsQuery}
            searchParams={searchParams}
            setLocation={setLocation}
            filters={executionFilters}
            onFilterChange={setExecutionFilters}
            onNodeClick={handleNodeClick}
            selectedNodeId={selectedNodeId}
            selectedNodeName={selectedNodeName}
            onNodeSelect={selectNode}
            onDeselectNode={deselectNode}
          />
        )}
      </NxPageBody>
    </NxPage>
  )
}
