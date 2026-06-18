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
import type React from 'react'
import '@xyflow/react/dist/style.css'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { executionsClient } from '../../client'
import { NxPage, NxPageBody } from '../../components/layout/NxPage'
import { NxPageHeader } from '../../components/layout/NxPageHeader'
import { NxPanel } from '../../components/layout/NxPanel'
import { ResizableDivider } from '../../components/ResizableDivider'
import { NxErrorState } from '../../components/states/NxErrorState'
import { NxLoadingState } from '../../components/states/NxLoadingState'
import { useNavigate } from '../../hooks/routing/useNavigate'
import { useParams } from '../../hooks/routing/useParams'
import { useSearch } from '../../hooks/routing/useSearch'
import { useDialogState } from '../../hooks/useDialogState'
import type { FilterConfig } from '../../types/filters'
import { detachPromise } from '../../utils/detachPromise'
import { useDocLink } from '../../utils/docs/useDocLink'
import { buildFilterParams } from '../../utils/filterUtils'
import { ExecutionDetailsPanel, type WorkflowDefShape } from '../builder/ExecutionDetailsPanel'
import { ExecutionViewContent } from '../builder/ExecutionViewContent'
import { WorkflowHistoryCard } from '../builder/WorkflowHistoryCard'
import { useExecutionStore } from '../workflows/stores/useExecutionStore'

import { ApprovalSidePanel } from './ApprovalSidePanel'
import { ConnectionBanner } from './ConnectionBanner'
import { CopyToEditorDialog } from './CopyToEditorDialog'
import { isExecutionCancellable } from './executionCancellable'
import styles from './ExecutionDetail.module.css'
import { ExecutionDetailHeaderToolbar, ExecutionDetailTitleRowAddons } from './ExecutionDetailPageHeaderParts'
import { executionDetailHasTitleRowExtras, executionDetailPageHeading } from './executionDetailPageHeaderTitle'
import { useExecutionApprovalPanel } from './hooks/useExecutionApprovalPanel'
import { useExecutionNodeClick } from './hooks/useExecutionNodeClick'
import { useExecutionStreaming, useSyncActivityStore } from './hooks/useExecutionStreaming'
import { useExecutionWorkflow } from './hooks/useExecutionWorkflow'
import { useForkWorkflow } from './hooks/useForkWorkflow'

/** Width constraint for the inline failure alert floating over the execution canvas. */
const INLINE_ALERT_WIDTH = 'clamp(15rem, 20vw, 22rem)'

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

      {approvalPanel && <FlexItem className={styles.approvalPanelSlot}>{approvalPanel}</FlexItem>}

      {historyCardOpen && (
        <FlexItem className={styles.approvalPanelSlot}>
          <WorkflowHistoryCard
            executions={executionsQuery.data?.resources ?? []}
            selectedExecutionId={executionId}
            onClose={() => {
              const params = new URLSearchParams(searchParams)
              params.set('history', 'closed')
              setLocation(`/executions/${executionId}?${params.toString()}`)
            }}
            onExecutionSelect={(selectedId) => {
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

export default function ExecutionDetail() {
  const executionsDocLink = useDocLink('executions')
  const params = useParams<{ executionId: string }>()
  const executionId = params.executionId
  const setLocation = useNavigate()
  const searchParams = useSearch()

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

  const execution = executionQuery.data

  useExecutionStreaming(executionId, execution)

  const historyCardOpen = useMemo(() => {
    const params = new URLSearchParams(searchParams)
    return params.get('history') !== 'closed'
  }, [searchParams])

  const [executionFilters, setExecutionFilters] = useState<FilterConfig[]>([])

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

  const { workflow, activities } = useExecutionWorkflow(execution)

  useSyncActivityStore(execution, activities)

  const nodeClick = useExecutionNodeClick(executionId)
  const { pendingApproval, isApprovalLoading, handleNodeClick } = nodeClick
  const { selectedNodeId, selectedNodeName, selectNode, deselectNode } = nodeClick
  const approval = useExecutionApprovalPanel(
    executionId,
    searchParams,
    nodeClick,
    execution?.workflow_definition ?? undefined
  )
  const copyToEditorDialog = useDialogState<void>()
  const isCancellable = isExecutionCancellable(execution?.status)

  const { forkAsNewWorkflow, isForkLoading } = useForkWorkflow({
    workflowDefinition: execution?.workflow_definition as Record<string, unknown> | undefined,
    workflowName: workflow?.name ?? 'Workflow',
    projectId: execution?.project_id,
  })

  if (!executionId) {
    return (
      <NxPage>
        <NxPageHeader title="Error" />
        <NxPageBody>
          <NxPanel isFullHeight>
            <NxErrorState title="Invalid execution" message="No execution ID provided" />
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
            <NxErrorState
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
            <NxLoadingState />
          </NxPanel>
        </NxPageBody>
      </NxPage>
    )
  }

  const toggleHistoryCard = () => {
    const willOpen = !historyCardOpen
    if (willOpen) {
      approval.close()
    }
    const params = new URLSearchParams(searchParams)
    params.set('history', willOpen ? 'open' : 'closed')
    setLocation(`/executions/${executionId}?${params.toString()}`)
  }

  return (
    <NxPage>
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
            showApprovalActionStrip={Boolean(pendingApproval ?? isApprovalLoading)}
            isApprovalLoading={isApprovalLoading}
            isApprovalPanelOpen={approval.panelOpen}
            onReviewClick={() => {
              approval.open()
            }}
            historyCardOpen={historyCardOpen}
            onToggleHistory={toggleHistoryCard}
            onBackToEditor={() => {
              if (execution?.workflow_id) {
                setLocation(`/workflow-builder/${execution.workflow_id}`)
              }
            }}
            onCopyToEditor={() => copyToEditorDialog.open(undefined)}
            isCancellable={isCancellable}
            executionId={executionId}
          />
        }
      />
      <NxPageBody>
        <ExecutionDetailContent
          key={executionId}
          historyCardOpen={historyCardOpen && !approval.panelOpen}
          approvalPanel={
            approval.panelOpen && pendingApproval ? (
              <ApprovalSidePanel
                approval={pendingApproval}
                message={approval.approvalMessage}
                onClose={approval.close}
                onDecisionSubmitted={approval.dismiss}
              />
            ) : undefined
          }
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
      </NxPageBody>

      <CopyToEditorDialog
        isOpen={copyToEditorDialog.isOpen}
        onClose={copyToEditorDialog.close}
        onReplace={() => {
          copyToEditorDialog.close()
          if (execution?.workflow_id && executionId)
            setLocation(`/workflow-builder/${execution.workflow_id}?fromExecution=${executionId}`)
        }}
        onFork={async () => {
          const id = await forkAsNewWorkflow()
          if (!id || !executionId) return
          copyToEditorDialog.close()
          setLocation(`/workflow-builder/${id}?linkExecution=${executionId}`)
        }}
        isForkLoading={isForkLoading}
      />
    </NxPage>
  )
}
