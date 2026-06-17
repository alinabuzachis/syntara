import { ExecutionStatusEnum, type WorkflowAPI } from '@ansible/nexus-contracts'
import { Alert, Flex, FlexItem, Stack, StackItem } from '@patternfly/react-core'
import { useQueryClient } from '@tanstack/react-query'
import { useReactFlow, useNodesInitialized } from '@xyflow/react'
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'

import { useUnsavedChanges } from '../../app/useUnsavedChanges'
import { executionsClient, workflowClient } from '../../client'
import { NxPage } from '../../components/layout/NxPage'
import { NxPanel } from '../../components/layout/NxPanel'
import { ResizableDivider } from '../../components/ResizableDivider'
import { useNavigate } from '../../hooks/routing/useNavigate'
import { useProjectSelector } from '../../hooks/useProjectSelector'
import { useAlerts } from '../../providers/alerts'
import { useWorkflowStore } from '../../stores/useWorkflowStore'
import type { FilterConfig } from '../../types/filters'
import { detachPromise } from '../../utils/detachPromise'
import { NodeExpandedAllContext } from '../workflows/canvas/nodes/common/NodeExpandedAllContext'

import { BuilderFlow } from './BuilderFlow'
import { builderReducer, getInitialBuilderState } from './builderReducer'
import { BuilderWorkflowPageHeader } from './BuilderWorkflowPageHeader'
import { BuilderDialogs } from './components/BuilderDialogs'
import { BuilderSidePanels } from './components/BuilderSidePanels'
import { NodeEditorOverlay } from './components/NodeEditorOverlay'
import { ExecutionDetailsPanel } from './ExecutionDetailsPanel'
import { useBuilderApproval } from './hooks/useBuilderApproval'
import { useBuilderContentQueries } from './hooks/useBuilderContentQueries'
import { useBuilderDerivedUiFlags } from './hooks/useBuilderDerivedUiFlags'
import { useBuilderFlowInteractionHandlers } from './hooks/useBuilderFlowInteractionHandlers'
import { useBuilderLiveRunPanel } from './hooks/useBuilderLiveRunPanel'
import { useBuilderSaveWorkflow, type UseBuilderSaveWorkflowParams } from './hooks/useBuilderSaveWorkflow'
import { useBuilderToolbarHandlers } from './hooks/useBuilderToolbarHandlers'
import { useBuilderWindowEffects } from './hooks/useBuilderWindowEffects'
import { useBuilderWorkflowLifecycle } from './hooks/useBuilderWorkflowLifecycle'
import { useExecutionCopyToEditor, type ExecutionCopyData } from './hooks/useExecutionCopyToEditor'
import { useNodePanelNavigation } from './hooks/useNodePanelNavigation'
import { usePublishWorkflow, useUnpublishWorkflow } from './hooks/usePublishWorkflow'
import { useRunStepDialog } from './hooks/useRunStepDialog'
import { useUndoRedoKeyboard } from './hooks/useUndoRedoKeyboard'
import { NodeActionsContext } from './NodeActionsContext'
import { useBuilderPermissions } from './useBuilderPermissions'
import { ValidationBanner } from './ValidationBanner'

type WorkflowWithVersion = WorkflowAPI.components['schemas']['WorkflowWithVersion']
type BuilderContentProps = {
  workflow?: WorkflowWithVersion
  isNew: boolean
  workflowId: string | null
  executionCopy?: ExecutionCopyData
}

// eslint-disable-next-line max-lines-per-function, complexity
export function BuilderContent(props: BuilderContentProps) {
  const { workflow, isNew, workflowId, executionCopy } = props
  const setLocation = useNavigate()
  const { showSuccess, showError } = useAlerts()
  const workflowProjectId = isNew ? undefined : (workflow as { project_id?: string })?.project_id
  const [saveAttemptedWithoutProject, setSaveAttemptedWithoutProject] = useState(false)
  const { selectedProject, ProjectSelector } = useProjectSelector({
    requireProject: isNew,
    initialProjectId: workflowProjectId ?? undefined,
    hasValidationError: saveAttemptedWithoutProject,
    onProjectSelect: () => setSaveAttemptedWithoutProject(false),
  })

  const queryClient = useQueryClient()
  const reactFlowInstance = useReactFlow()
  const nodesInitialized = useNodesInitialized()
  const {
    setWorkflow,
    loadWorkflowWithEdges,
    currentWorkflow,
    setEdges: setStoredEdges,
    isDirty,
    markClean,
    markDirty,
    duplicateActivity,
  } = useWorkflowStore()
  const { registerSaveHandler, unregisterSaveHandler, requestNavigation } = useUnsavedChanges()
  const handleExecutionNavigate = useCallback(
    (id: string) => requestNavigation(`/executions/${id}`),
    [requestNavigation]
  )

  const [executionFilters, setExecutionFilters] = useState<FilterConfig[]>([])

  const [state, dispatch] = useReducer(builderReducer, getInitialBuilderState())
  const {
    confirmDialogOpen,
    deleteDialogOpen,
    detailsOpen,
    historyCardOpen,
    isKebabOpen,
    addNodePanelOpen,
    nodeEditorMode,
    nodeEditorNodeTypeId,
    nodeEditorNodeSubtypeId,
    selectedNode,
    sourceNodeId,
    targetNodeId,
    edgeIdToReplace,
    sourceHandle,
    targetHandle,
    replacementNodeId,
    workflowName,
    workflowDescription,
    workflowTags,
    mostRecentExecutionId,
    mostRecentRunPanelOpen,
    selectedTriggerIndex,
  } = state

  const expandAllEvent = useMemo(() => new EventTarget(), [])
  const collapseAllEvent = useMemo(() => new EventTarget(), [])
  const { hasNoWorkflowNodes, isAddNodePanelOpen, isNodeEditorOpen } = useBuilderDerivedUiFlags(
    currentWorkflow,
    addNodePanelOpen,
    nodeEditorMode
  )

  useUndoRedoKeyboard({ disabled: isNodeEditorOpen })
  useEffect(() => () => useWorkflowStore.temporal.getState().clear(), [])

  const { executionsQuery, mostRecentExecutionQuery, workflowsListQuery } = useBuilderContentQueries({
    workflowId,
    isNew,
    executionFilters,
    mostRecentExecutionId,
    mostRecentRunPanelOpen,
  })

  const mostRecentExecutionStatus = mostRecentExecutionQuery.data?.status
  const isTerminalStatus =
    mostRecentExecutionStatus === ExecutionStatusEnum.COMPLETED ||
    mostRecentExecutionStatus === ExecutionStatusEnum.FAILED ||
    mostRecentExecutionStatus === ExecutionStatusEnum.CANCELLED

  useBuilderWorkflowLifecycle({
    workflowId,
    isNew,
    workflow,
    workflowName,
    workflowsListResources: workflowsListQuery.data?.resources,
    workflowsListDataUndefined: workflowsListQuery.data === undefined,
    workflowsListIsPending: workflowsListQuery.isPending,
    workflowsListError: workflowsListQuery.error,
    dispatch,
    setWorkflow,
    setStoredEdges,
    loadWorkflowWithEdges,
  })

  useExecutionCopyToEditor({ executionCopy, dispatch, markDirty, showSuccess })

  const { mutate: createWorkflow, isPending: isCreating } = workflowClient.useMutation('post', '/workflows')
  const { mutate: updateWorkflow, isPending: isUpdating } = workflowClient.useMutation(
    'patch',
    '/workflows/{workflow_id}'
  )
  const { mutate: executeWorkflow } = executionsClient.useMutation('post', '/executions')
  const { mutate: deleteWorkflow } = workflowClient.useMutation('delete', '/workflows/{workflow_id}')

  const wfName = workflow?.name ?? ''
  const wfId = workflow?.id ?? ''
  const wfCurrentVersion = workflow?.current_version
  const wfVersionVersion = workflow?.version?.version
  const wfPublishedVersion = workflow?.published_version
  const wfCreatedBy = workflow?.created_by
  const workflowMetadata = useMemo(() => {
    if (!wfName && !wfId) return undefined
    return {
      name: wfName,
      id: wfId,
      version: wfCurrentVersion ?? wfVersionVersion ?? 0,
      published: wfPublishedVersion != null,
      author: String(wfCreatedBy ?? 'Unknown'),
    }
  }, [wfName, wfId, wfCurrentVersion, wfVersionVersion, wfPublishedVersion, wfCreatedBy])

  const currentVersion = workflow?.current_version ?? workflow?.version?.version
  const { publish: onPublish, isPublishing } = usePublishWorkflow(workflowId, currentVersion)
  const { unpublish: onUnpublish } = useUnpublishWorkflow(workflowId)

  const handleSaveWorkflow = useBuilderSaveWorkflow({
    currentWorkflow,
    workflowName,
    workflowDescription,
    workflowTags,
    workflowId,
    isNew,
    selectedProject: selectedProject?.id ? { id: selectedProject.id } : null,
    workflowsListResources: workflowsListQuery.data?.resources,
    queryClient,
    setLocation,
    showSuccess,
    showError,
    onMissingProjectForCreate: () => {
      setSaveAttemptedWithoutProject(true)
    },
    markClean,
    createWorkflow: createWorkflow as UseBuilderSaveWorkflowParams['createWorkflow'],
    updateWorkflow,
  })

  const { runStepDialog, lastRunStepNodeIdRef, pinnedMockDataForDialog, handleRunStep } = useRunStepDialog(
    handleSaveWorkflow,
    isTerminalStatus
  )

  useEffect(() => {
    registerSaveHandler(handleSaveWorkflow)
    return () => unregisterSaveHandler()
  }, [handleSaveWorkflow, registerSaveHandler, unregisterSaveHandler])

  const { handleRunWorkflow, handleDeleteWorkflow, handleToggleDetails, handleToggleHistory } =
    useBuilderToolbarHandlers({
      workflow: workflow as { id: string } | undefined,
      workflowName,
      detailsOpen,
      historyCardOpen,
      reactFlowInstance,
      executionsQuery,
      dispatch,
      executeWorkflow,
      deleteWorkflow,
      showSuccess,
      showError,
      setLocation,
      handleSaveWorkflow,
      currentWorkflow,
    })

  const {
    handleNodeClick,
    handleClearDesiredPosition,
    handleAddNodeFromEdge,
    handleConnectFromPanel,
    handleNodesDeleted,
    nodeActionsValue,
  } = useBuilderFlowInteractionHandlers({
    reactFlowInstance,
    dispatch,
    duplicateActivity,
    edgeIdToReplace,
    targetNodeId,
    sourceHandle,
    targetHandle,
    onRunStep: handleRunStep,
  })

  const handleNavigateToNode = useNodePanelNavigation(reactFlowInstance, dispatch)

  /* Re-renders when React Flow node count changes (execution-view sequencing); see useBuilderWindowEffects */
  useBuilderWindowEffects(nodesInitialized, reactFlowInstance)

  const mostRecentExecution = mostRecentExecutionQuery.data

  const {
    showMostRecentRunPanelInEditor,
    canvasExecutionStatus,
    mostRecentSelectedNodeId,
    mostRecentSelectedNodeName,
    mostRecentPanelHeight,
    handleMostRecentResize,
    handleMostRecentNodeSelect,
    handleMostRecentDeselectNode,
  } = useBuilderLiveRunPanel({
    mostRecentExecutionId,
    mostRecentRunPanelOpen,
    executionStatus: mostRecentExecution?.status,
    isViewingExecution: false,
  })

  const isLiveRunActive = showMostRecentRunPanelInEditor && !isTerminalStatus

  const handleCloseMostRecentRunPanel = useCallback(() => {
    dispatch({ type: 'CLOSE_MOST_RECENT_RUN_PANEL' })
  }, [dispatch])

  const {
    pendingApproval,
    isApprovalLoading,
    approvalViewOpen,
    activityNameMap,
    wrappedHandleNodeClick,
    handleApprovalClose,
    openApprovalView,
  } = useBuilderApproval({
    mostRecentExecutionId,
    showMostRecentRunPanelInEditor,
    currentWorkflow,
    handleNodeClick,
    isLiveRunActive,
  })

  const builderPermissions = useBuilderPermissions(isNew)

  const triggers = currentWorkflow?.triggers ?? []
  const selectedTrigger = triggers[selectedTriggerIndex] ?? triggers[0]

  const nodeExpandedAllContextValue = useMemo(
    () => ({ expandAllEvent, collapseAllEvent }),
    [expandAllEvent, collapseAllEvent]
  )

  return (
    <NodeActionsContext.Provider value={nodeActionsValue}>
      <NodeExpandedAllContext.Provider value={nodeExpandedAllContextValue}>
        <NxPage>
          <Stack hasGutter>
            <StackItem>
              <BuilderWorkflowPageHeader
                workflowName={workflowName}
                workflowDescription={workflowDescription}
                workflowTags={workflowTags}
                isNew={isNew}
                workflow={workflow?.id ? { id: workflow.id } : undefined}
                isPending={isCreating || isUpdating}
                isDirty={isDirty}
                lastSavedAt={workflow?.updated_at}
                isKebabOpen={isKebabOpen}
                publishedVersion={workflow?.published_version ?? null}
                currentVersion={currentVersion}
                isPublishing={isPublishing}
                ProjectSelector={ProjectSelector}
                dispatch={dispatch}
                markDirty={markDirty}
                handleToggleHistory={handleToggleHistory}
                handleToggleDetails={handleToggleDetails}
                handleSaveWorkflow={handleSaveWorkflow}
                onPublish={onPublish}
                onUnpublish={onUnpublish}
                isLiveRunActive={isLiveRunActive}
                executionId={mostRecentExecutionId}
                executionStatus={mostRecentExecution?.status}
                onBackToEditor={isLiveRunActive ? handleCloseMostRecentRunPanel : undefined}
                hasApprovalPending={!!pendingApproval}
                isApprovalLoading={isApprovalLoading}
                onReviewApproval={openApprovalView}
                triggers={triggers}
                isAddNodePanelOpen={isAddNodePanelOpen}
                hasNoWorkflowNodes={hasNoWorkflowNodes}
                builderPermissions={builderPermissions}
              />
            </StackItem>
            {!builderPermissions.canEdit && !builderPermissions.isLoading && (
              <StackItem>
                <Alert variant="info" isInline title="You are viewing this workflow in read-only mode.">
                  You do not have permission to edit this workflow. Contact your administrator to request access.
                </Alert>
              </StackItem>
            )}
            <ValidationBanner
              errors={state.validationErrors}
              dispatch={dispatch}
              onNavigateToNode={handleNavigateToNode}
            />
            <StackItem isFilled style={{ minHeight: 0 }}>
              <Flex
                alignItems={{ default: 'alignItemsStretch' }}
                flexWrap={{ default: 'nowrap' }}
                gap={{ default: 'gapSm' }}
                style={{
                  position: 'relative',
                  minWidth: 0,
                  height: '100%',
                  overflow: 'visible',
                  display: 'flex',
                  flexDirection: 'row',
                  width: '100%',
                }}
              >
                <FlexItem
                  style={{
                    position: 'relative',
                    minWidth: 0,
                    flexGrow: 1,
                    height: '100%',
                    pointerEvents: isNodeEditorOpen ? 'none' : 'auto',
                  }}
                >
                  <Stack
                    style={{
                      height: '100%',
                      minHeight: 0,
                      gap: 0,
                    }}
                  >
                    <StackItem isFilled style={{ minHeight: 0 }}>
                      <NxPanel
                        hasNoPadding
                        isFullHeight
                        style={{
                          position: 'relative',
                          minWidth: 0,
                          width: '100%',
                          height: '100%',
                        }}
                      >
                        <BuilderFlow
                          workflowId={workflowId}
                          canEdit={builderPermissions.canEdit}
                          panelOpen={isAddNodePanelOpen || !!selectedNode}
                          activeEdgeButtonNodeId={isAddNodePanelOpen ? sourceNodeId : null}
                          activeEdgeButtonHandle={isAddNodePanelOpen ? sourceHandle : null}
                          activeEdgeId={isAddNodePanelOpen ? edgeIdToReplace : null}
                          executionStatus={canvasExecutionStatus}
                          disableDeleteKey={isNodeEditorOpen}
                          disableSpacePanning={isNodeEditorOpen || confirmDialogOpen}
                          onNodeClick={wrappedHandleNodeClick}
                          onAddNodeFromEdge={handleAddNodeFromEdge}
                          onNodesDeleted={handleNodesDeleted}
                          newNodeDesiredPosition={state.newNodeDesiredPosition}
                          onClearDesiredPosition={handleClearDesiredPosition}
                          validationErrors={state.validationErrors}
                        />
                      </NxPanel>
                    </StackItem>
                    {showMostRecentRunPanelInEditor && mostRecentExecutionId && (
                      <>
                        <ResizableDivider onResize={handleMostRecentResize} />
                        <StackItem
                          style={{
                            height: `${mostRecentPanelHeight}px`,
                            flexShrink: 0,
                            overflow: 'hidden',
                          }}
                        >
                          <ExecutionDetailsPanel
                            executionId={mostRecentExecutionId}
                            workflowDefinition={
                              workflow?.version?.workflow_definition as Parameters<
                                typeof ExecutionDetailsPanel
                              >[0]['workflowDefinition']
                            }
                            selectedNodeId={mostRecentSelectedNodeId}
                            selectedNodeName={mostRecentSelectedNodeName}
                            onNodeSelect={handleMostRecentNodeSelect}
                            onDeselectNode={handleMostRecentDeselectNode}
                            headerLabel="Most recent run details"
                            onClosePanel={isTerminalStatus ? handleCloseMostRecentRunPanel : undefined}
                          />
                        </StackItem>
                      </>
                    )}
                  </Stack>
                </FlexItem>
                <BuilderSidePanels
                  isAddNodePanelOpen={isAddNodePanelOpen}
                  isNodeEditorOpen={isNodeEditorOpen}
                  canEdit={builderPermissions.canEdit}
                  sourceNodeId={sourceNodeId}
                  replacementNodeId={replacementNodeId}
                  hasNoWorkflowNodes={hasNoWorkflowNodes}
                  dispatch={dispatch}
                  historyCardOpen={historyCardOpen}
                  isNew={isNew}
                  executions={executionsQuery.data?.resources ?? []}
                  onExecutionNavigate={handleExecutionNavigate}
                  executionFilters={executionFilters}
                  onFilterChange={setExecutionFilters}
                  detailsOpen={detailsOpen}
                  workflow={workflow}
                  workflowName={workflowName}
                  workflowDescription={workflowDescription}
                  markDirty={markDirty}
                />

                <NodeEditorOverlay
                  isOpen={isNodeEditorOpen}
                  mode={nodeEditorMode}
                  selectedNode={selectedNode}
                  nodeTypeId={nodeEditorNodeTypeId}
                  nodeSubtypeId={nodeEditorNodeSubtypeId}
                  sourceNodeId={sourceNodeId}
                  replacementNodeId={replacementNodeId}
                  executionId={mostRecentExecutionId}
                  workflowId={workflowId}
                  onConnect={handleConnectFromPanel}
                  onClose={() => dispatch({ type: 'CLOSE_NODE_EDITOR' })}
                  onNavigateToNode={handleNavigateToNode}
                  projectId={
                    // TODO: Remove cast when project_id is added to the OpenAPI spec
                    (workflow as unknown as { project_id?: string })?.project_id ?? selectedProject?.id
                  }
                  workflowMetadata={workflowMetadata}
                  onRunStep={selectedNode ? () => detachPromise(handleRunStep(selectedNode.id)) : undefined}
                />
              </Flex>
            </StackItem>
          </Stack>

          <BuilderDialogs
            workflowName={workflowName}
            workflowId={workflowId}
            confirmDialogOpen={confirmDialogOpen}
            deleteDialogOpen={deleteDialogOpen}
            dispatch={dispatch}
            handleRunWorkflow={handleRunWorkflow}
            handleDeleteWorkflow={handleDeleteWorkflow}
            pendingApproval={pendingApproval}
            approvalViewOpen={approvalViewOpen}
            activityNameMap={activityNameMap}
            handleApprovalClose={handleApprovalClose}
            triggerName={selectedTrigger?.name ?? 'Trigger'}
            triggerNodeId={selectedTrigger?.id}
            triggerInputSchema={
              (selectedTrigger?.parameters as Record<string, unknown> | undefined)?.input_schema as
                | Record<string, unknown>
                | undefined
            }
            runStepDialog={runStepDialog}
            onRunStepExecutionCreated={(executionId, { clearMocksOnComplete }) => {
              lastRunStepNodeIdRef.current = clearMocksOnComplete ? (runStepDialog.item?.nodeId ?? null) : null
              dispatch({ type: 'SET_MOST_RECENT_EXECUTION', payload: executionId })
            }}
            pinnedMockData={pinnedMockDataForDialog}
          />
        </NxPage>
      </NodeExpandedAllContext.Provider>
    </NodeActionsContext.Provider>
  )
}
