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
import { useNavigate, useParams, useRouterState } from '@tanstack/react-router'
import type React from 'react'
import '@xyflow/react/dist/style.css'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { AppRoute } from '../../app/AppRoute'
import { executionsClient } from '../../client'
import { NxPage, NxPageBody } from '../../components/layout/NxPage'
import { NxPageHeader } from '../../components/layout/NxPageHeader'
import { NxReactFlowViewportGuard } from '../../components/layout/NxReactFlowViewportGuard'
import { ResizableDivider } from '../../components/ResizableDivider'
import type { PaginationFooterProps } from '../../components/table/PaginationFooter'
import { useCursorPagination } from '../../hooks/useCursorPagination'
import { useDialogState } from '../../hooks/useDialogState'
import type { FilterConfig } from '../../types/filters'
import { detachPromise } from '../../utils/detachPromise'
import { useDocLink } from '../../utils/docs/useDocLink'
import { ExecutionDetailsPanel, type WorkflowDefShape } from '../builder/ExecutionDetailsPanel'
import { ExecutionViewContent } from '../builder/ExecutionViewContent'
import { useActivityNameMap } from '../builder/useActivityNameMap'
import { WorkflowHistoryCard } from '../builder/WorkflowHistoryCard'
import type { ActivityState } from '../workflows/execution/types'
import { useExecutionStore, useExecutionWithLiveStatus } from '../workflows/stores/useExecutionStore'

import { ApprovalSidePanel } from './ApprovalSidePanel'
import { ExecutionDetailErrorStates } from './components/ExecutionDetailErrorStates'
import { ConnectionBanner } from './ConnectionBanner'
import { CopyToEditorDialog } from './CopyToEditorDialog'
import { isExecutionCancellable } from './executionCancellable'
import styles from './ExecutionDetail.module.css'
import { ExecutionDetailHeaderToolbar, ExecutionDetailTitleRowAddons } from './ExecutionDetailPageHeaderParts'
import { executionDetailHasTitleRowExtras, executionDetailPageHeading } from './executionDetailPageHeaderTitle'
import { useApprovalNavigation } from './hooks/useApprovalNavigation'
import { useExecutionApprovalPanel } from './hooks/useExecutionApprovalPanel'
import { useExecutionNodeClick } from './hooks/useExecutionNodeClick'
import { useExecutionStreaming, useSyncActivityStore } from './hooks/useExecutionStreaming'
import { useExecutionWorkflow } from './hooks/useExecutionWorkflow'
import { useForkWorkflow } from './hooks/useForkWorkflow'

/** Width constraint for the inline failure alert floating over the execution canvas. */
const INLINE_ALERT_WIDTH = 'clamp(15rem, 20vw, 22rem)'

/** Build activity name map from workflow definition for resolving approval node names. */
function useActivityNamesForExecution(
  workflowDefinition: WorkflowDefShape | undefined | null,
  activities: (ActivityData | ActivityExecution)[]
): Map<string, string> {
  const activityStates = useMemo(() => {
    const map = new Map<string, ActivityState>()
    for (const activity of activities) {
      const activityId = 'activity_id' in activity ? activity.activity_id : null
      if (activityId) {
        map.set(activityId, { activityId, status: activity.status } as ActivityState)
      }
    }
    return map
  }, [activities])

  const { nameMap } = useActivityNameMap(workflowDefinition, activityStates)
  return nameMap
}

type Execution = ExecutionsAPI.components['schemas']['ExecutionRead']
type ActivityData = ExecutionsAPI.components['schemas']['ActivityData']
type ActivityExecution = ExecutionsAPI.components['schemas']['ActivityExecution']

type ExecutionWorkflow = {
  id: string
  name: string
  description?: string
  version: { workflow_definition: WorkflowDefShape | null }
}

// Inner component that has access to React Flow context
function ExecutionDetailContent({
  historyCardOpen,
  approvalPanel,
  workflow,
  execution,
  activities,
  executionId,
  executionsQuery,
  navigate,
  filters,
  onFilterChange,
  paginationFooterProps,
  onNodeClick,
  selectedNodeId,
  selectedNodeName,
  onNodeSelect,
  currentApprovalNodeId,
}: Readonly<{
  historyCardOpen: boolean
  approvalPanel?: React.ReactNode
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
  navigate: ReturnType<typeof useNavigate>
  filters: FilterConfig[]
  onFilterChange: (filters: FilterConfig[]) => void
  paginationFooterProps: PaginationFooterProps
  onNodeClick?: (event: React.MouseEvent, node: { id: string; type?: string; data: Record<string, unknown> }) => void
  selectedNodeId: string | null
  selectedNodeName: string | null
  onNodeSelect: (nodeId: string, nodeName: string) => void
  currentApprovalNodeId?: string | null
}>) {
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
            <div
              role="none"
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
              selectedActivityId={currentApprovalNodeId ?? selectedNodeId}
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
            />
          </div>
        </div>
      </FlexItem>

      {approvalPanel && <FlexItem className={styles.approvalPanelSlot}>{approvalPanel}</FlexItem>}

      {historyCardOpen && (
        <FlexItem className={styles.approvalPanelSlot}>
          <WorkflowHistoryCard
            executions={executionsQuery.data?.resources ?? []}
            selectedExecutionId={executionId}
            onClose={() => {
              detachPromise(
                navigate({
                  to: '/executions/$executionId',
                  params: { executionId },
                  search: (prev: Record<string, unknown>) => ({ ...prev, history: 'closed' }),
                })
              )
            }}
            onExecutionSelect={(selectedId) => {
              detachPromise(
                navigate({
                  to: '/executions/$executionId',
                  params: { executionId: selectedId },
                  search: (prev: Record<string, unknown>) => ({ ...prev }),
                })
              )
            }}
            filters={filters}
            onFilterChange={onFilterChange}
            paginationFooterProps={paginationFooterProps}
          />
        </FlexItem>
      )}
    </Flex>
  )
}

export default function ExecutionDetail() {
  const executionsDocLink = useDocLink('executions')
  const { executionId }: { executionId: string } = useParams({ strict: false })
  const navigate = useNavigate()
  const searchParams = useRouterState({ select: (s) => s.location.searchStr.replace(/^\?/, '') })

  const { reset } = useExecutionStore.getState()

  useEffect(() => {
    if (executionId) {
      reset()
    }
  }, [executionId, reset])

  const executionQuery = executionsClient.useQuery('get', '/executions/{execution_id}', {
    params: {
      path: { execution_id: executionId ?? '' },
      query: {
        include: 'workflow_definition,activities',
      },
    },
    enabled: !!executionId,
  })

  const execution = useExecutionWithLiveStatus(executionQuery.data)

  useExecutionStreaming(executionId, execution)

  const historyCardOpen = useMemo(() => {
    const params = new URLSearchParams(searchParams)
    return params.get('history') !== 'closed'
  }, [searchParams])

  const {
    filters: executionFilters,
    queryParams: executionsQueryParams,
    handleFilterChange: handleExecutionFilterChange,
    getFooterProps: getExecutionPaginationFooterProps,
  } = useCursorPagination({
    limit: 20,
    extraParams: { workflow_id: execution?.workflow_id ?? '' },
  })

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

  const executionPaginationFooterProps = useMemo(
    () => getExecutionPaginationFooterProps(executionsQuery.data),
    [getExecutionPaginationFooterProps, executionsQuery.data]
  )

  const { workflow, activities } = useExecutionWorkflow(execution)

  useSyncActivityStore(execution, activities)

  const activityNameMap = useActivityNamesForExecution(
    execution?.workflow_definition as WorkflowDefShape | undefined,
    activities
  )

  const nodeClick = useExecutionNodeClick(executionId)
  const { approvals, currentIndex, currentApproval, isApprovalLoading, handleNodeClick, navigateToIndex } = nodeClick
  const { selectedNodeId, selectedNodeName, selectNode } = nodeClick
  const approval = useExecutionApprovalPanel(
    executionId,
    searchParams,
    nodeClick,
    execution?.workflow_definition ?? undefined
  )
  const approvalNavigation = useApprovalNavigation(currentIndex, navigateToIndex, approvals)
  const copyToEditorDialog = useDialogState<void>()
  const isCancellable = isExecutionCancellable(execution?.status)

  const { forkAsNewWorkflow, isForkLoading } = useForkWorkflow({
    workflowDefinition: execution?.workflow_definition as Record<string, unknown> | undefined,
    workflowName: workflow?.name ?? 'Workflow',
    projectId: execution?.project_id,
  })

  const errorState = ExecutionDetailErrorStates({
    executionId,
    isLoading: executionQuery.isLoading,
    error: executionQuery.error,
    onRetry: executionQuery.refetch,
  })

  if (errorState) {
    return errorState
  }

  const toggleHistoryCard = () => {
    const willOpen = !historyCardOpen
    if (willOpen) {
      approval.close()
    }
    detachPromise(
      navigate({
        to: '/executions/$executionId',
        params: { executionId },
        search: (prev: Record<string, unknown>) => ({ ...prev, history: willOpen ? 'open' : 'closed' }),
      })
    )
  }

  return (
    <NxPage>
      <NxReactFlowViewportGuard onReturn={() => detachPromise(navigate({ to: AppRoute.Executions.Root }))}>
        <NxPageHeader
          title={executionDetailPageHeading(execution, executionId)}
          docLink={executionsDocLink}
          titleProps={{ size: TitleSizes['2xl'] }}
          titleAddons={
            executionDetailHasTitleRowExtras(execution) ? (
              <ExecutionDetailTitleRowAddons execution={execution} />
            ) : undefined
          }
          toolbar={
            <ExecutionDetailHeaderToolbar
              showApprovalActionStrip={Boolean(currentApproval ?? isApprovalLoading)}
              isApprovalLoading={isApprovalLoading}
              isApprovalPanelOpen={approval.panelOpen}
              onReviewClick={() => {
                approval.open()
              }}
              historyCardOpen={historyCardOpen}
              onToggleHistory={toggleHistoryCard}
              onBackToEditor={() => {
                if (execution?.workflow_id) {
                  detachPromise(
                    navigate({ to: '/workflow-builder/$workflowId', params: { workflowId: execution.workflow_id } })
                  )
                }
              }}
              onCopyToEditor={() => copyToEditorDialog.open(undefined)}
              isCancellable={isCancellable}
              executionId={executionId}
              execution={execution}
            />
          }
        />
        <NxPageBody>
          <ExecutionDetailContent
            key={executionId}
            historyCardOpen={historyCardOpen && !approval.panelOpen}
            approvalPanel={
              approval.panelOpen && currentApproval ? (
                <ApprovalSidePanel
                  approval={currentApproval}
                  message={approval.approvalMessage}
                  activityNameMap={activityNameMap}
                  onClose={approval.close}
                  onDecisionSubmitted={approval.dismiss}
                  currentIndex={currentIndex}
                  totalCount={approvals.length}
                  hasPrev={approvalNavigation.hasPrev}
                  hasNext={approvalNavigation.hasNext}
                  onNavigatePrev={approvalNavigation.navigatePrev}
                  onNavigateNext={approvalNavigation.navigateNext}
                />
              ) : undefined
            }
            workflow={workflow}
            execution={execution}
            activities={activities}
            executionId={executionId}
            executionsQuery={executionsQuery}
            navigate={navigate}
            filters={executionFilters}
            onFilterChange={handleExecutionFilterChange}
            paginationFooterProps={executionPaginationFooterProps}
            onNodeClick={handleNodeClick}
            selectedNodeId={selectedNodeId}
            selectedNodeName={selectedNodeName}
            onNodeSelect={selectNode}
            currentApprovalNodeId={currentApproval?.approval_node_id}
          />
        </NxPageBody>
      </NxReactFlowViewportGuard>

      <CopyToEditorDialog
        isOpen={copyToEditorDialog.isOpen}
        onClose={copyToEditorDialog.close}
        onReplace={() => {
          copyToEditorDialog.close()
          if (execution?.workflow_id && executionId)
            detachPromise(
              navigate({
                to: '/workflow-builder/$workflowId',
                params: { workflowId: execution.workflow_id },
                search: { fromExecution: executionId },
              })
            )
        }}
        onFork={async () => {
          const id = await forkAsNewWorkflow()
          if (!id || !executionId) return
          copyToEditorDialog.close()
          detachPromise(
            navigate({
              to: '/workflow-builder/$workflowId',
              params: { workflowId: id },
              search: { linkExecution: executionId },
            })
          )
        }}
        isForkLoading={isForkLoading}
      />
    </NxPage>
  )
}
