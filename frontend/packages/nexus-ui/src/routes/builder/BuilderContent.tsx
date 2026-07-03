import { Flex, FlexItem, Stack, StackItem } from '@patternfly/react-core'
import { useQueryClient } from '@tanstack/react-query'
import { useReactFlow, useNodesInitialized } from '@xyflow/react'
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'

import { useUnsavedChanges } from '../../app/useUnsavedChanges'
import { executionsClient, workflowClient } from '../../client'
import { NxPage } from '../../components/layout/NxPage'
import { NxPanel } from '../../components/layout/NxPanel'
import { NxReactFlowViewportGuard } from '../../components/layout/NxReactFlowViewportGuard'
import { useNavigate } from '../../hooks/routing/useNavigate'
import { useProjectSelector } from '../../hooks/useProjectSelector'
import { useAlerts } from '../../providers/alerts'
import { useWorkflowStore } from '../../stores/useWorkflowStore'
import type { FilterConfig } from '../../types/filters'
import { detachPromise } from '../../utils/detachPromise'
import { ApprovalSidePanel } from '../executions/ApprovalSidePanel'
import { NodeExpandedAllContext } from '../workflows/canvas/nodes/common/NodeExpandedAllContext'

import styles from './BuilderContent.module.css'
import { BuilderFlow } from './BuilderFlow'
import { BuilderReadOnlyBanner } from './BuilderReadOnlyBanner'
import { builderReducer, getInitialBuilderState } from './builderReducer'
import { BuilderWorkflowPageHeader } from './BuilderWorkflowPageHeader'
import { BuilderDialogs } from './components/BuilderDialogs'
import { BuilderSidePanels } from './components/BuilderSidePanels'
import { ExecutionDetailsPanelWrapper } from './components/ExecutionDetailsPanelWrapper'
import { NodeEditorOverlay } from './components/NodeEditorOverlay'
import { VersionHistorySidePanel } from './components/VersionHistorySidePanel'
import { useBuilderApproval } from './hooks/useBuilderApproval'
import { useBuilderConflict } from './hooks/useBuilderConflict'
import { useBuilderContentQueries } from './hooks/useBuilderContentQueries'
import { useBuilderDerivedUiFlags } from './hooks/useBuilderDerivedUiFlags'
import { useBuilderDialogProps } from './hooks/useBuilderDialogProps'
import { useBuilderFlowInteractionHandlers } from './hooks/useBuilderFlowInteractionHandlers'
import { useBuilderLiveRunPanel } from './hooks/useBuilderLiveRunPanel'
import { useBuilderSaveWorkflow, type UseBuilderSaveWorkflowParams } from './hooks/useBuilderSaveWorkflow'
import { useBuilderToolbarHandlers } from './hooks/useBuilderToolbarHandlers'
import { useBuilderValidation } from './hooks/useBuilderValidation'
import { useBuilderVersionPanel } from './hooks/useBuilderVersionPanel'
import { useBuilderWindowEffects } from './hooks/useBuilderWindowEffects'
import { useBuilderWorkflowLifecycle } from './hooks/useBuilderWorkflowLifecycle'
import { useExecutionCopyToEditor } from './hooks/useExecutionCopyToEditor'
import { useNodePanelNavigation } from './hooks/useNodePanelNavigation'
import { usePublishWorkflow, useUnpublishWorkflow } from './hooks/usePublishWorkflow'
import { useRunStepDialog } from './hooks/useRunStepDialog'
import { useUndoRedoKeyboard } from './hooks/useUndoRedoKeyboard'
import { useWorkflowMetadata } from './hooks/useWorkflowMetadata'
import { NodeActionsContext } from './NodeActionsContext'
import type { BuilderContentProps } from './types/builderContent'
import { useBuilderPermissions } from './useBuilderPermissions'
import { createAddStepHandler } from './utils/panelActions'
import { ValidationBanner } from './ValidationBanner'
import { VersionInfoCard } from './VersionInfoCard'
import { VersionViewProvider } from './VersionViewContext'
/* eslint-disable max-lines */
// eslint-disable-next-line max-lines-per-function, complexity
export function BuilderContent(props: BuilderContentProps) {
  const { workflow, isNew, workflowId, executionCopy, initialViewVersion } = props
  const setLocation = useNavigate()
  const { showSuccess, showError } = useAlerts()
  const [saveAttemptedWithoutProject, setSaveAttemptedWithoutProject] = useState(false)
  const { selectedProject, stableProjectId, ProjectSelector } = useProjectSelector({
    requireProject: isNew,
    initialProjectId: isNew ? undefined : (workflow?.project_id ?? undefined),
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
    mostRecentExecutionId,
    mostRecentRunPanelOpen,
    selectedTriggerIndex,
    viewingVersion,
    versionHistoryOpen,
  } = state

  const [expandAllEvent, collapseAllEvent] = useMemo(() => [new EventTarget(), new EventTarget()], [])
  const { hasNoWorkflowNodes, isAddNodePanelOpen, isNodeEditorOpen } = useBuilderDerivedUiFlags(
    currentWorkflow,
    addNodePanelOpen,
    nodeEditorMode
  )

  useUndoRedoKeyboard({ disabled: isNodeEditorOpen || viewingVersion !== null })
  useEffect(() => () => useWorkflowStore.temporal.getState().clear(), [])
  const { executionsQuery, mostRecentExecutionQuery, workflowsListQuery } = useBuilderContentQueries({
    workflowId,
    isNew,
    executionFilters,
    mostRecentExecutionId,
    mostRecentRunPanelOpen,
  })

  useBuilderWorkflowLifecycle({
    workflowId,
    isNew,
    workflow,
    workflowName,
    initialViewVersion,
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
  const { handleForceSaveSuccess } = useBuilderValidation({
    dispatch,
    hasValidationIssues: workflow?.has_validation_issues,
    isNew,
    currentWorkflow,
  })
  const { mutate: createWorkflow, isPending: isCreating } = workflowClient.useMutation('post', '/workflows')
  const { mutate: updateWorkflow, isPending: isUpdating } = workflowClient.useMutation(
    'patch',
    '/workflows/{workflow_id}'
  )
  const { mutate: executeWorkflow } = executionsClient.useMutation('post', '/executions')
  const { mutate: deleteWorkflow } = workflowClient.useMutation('delete', '/workflows/{workflow_id}')
  const workflowMetadata = useWorkflowMetadata(workflow)
  const currentVersion = workflow?.current_version ?? workflow?.version?.version

  const { loadedVersion, handleConflict, onVersionUpdated, setActions, conflictDialogProps } = useBuilderConflict({
    workflowId,
    workflowName,
    workflowDescription,
    workflowProjectId: workflow?.project_id,
    selectedProjectId: stableProjectId,
    currentWorkflow,
    currentVersion,
    isNew,
    setLocation,
    showError,
    markClean,
  })

  const { unpublish: onUnpublish } = useUnpublishWorkflow(workflowId)
  const handleSaveWorkflow = useBuilderSaveWorkflow({
    currentWorkflow,
    workflowName,
    workflowDescription,
    workflowId,
    isNew,
    selectedProject: stableProjectId ? { id: stableProjectId } : null,
    workflowsListResources: workflowsListQuery.data?.resources,
    queryClient,
    setLocation,
    showSuccess,
    showError,
    onMissingProjectForCreate: () => setSaveAttemptedWithoutProject(true),
    onForceSaveSuccess: handleForceSaveSuccess,
    markClean,
    expectedVersion: loadedVersion,
    onConflict: handleConflict('save'),
    onVersionUpdated,
    createWorkflow: createWorkflow as UseBuilderSaveWorkflowParams['createWorkflow'],
    updateWorkflow,
  })
  const { publish: onPublish, isPublishing } = usePublishWorkflow(
    workflowId,
    currentVersion,
    workflowName,
    workflowDescription,
    { expectedVersion: loadedVersion, onConflict: handleConflict('publish') }
  )

  const mostRecentExecution = mostRecentExecutionQuery.data
  const {
    showMostRecentRunPanelInEditor,
    isTerminalStatus,
    isLiveRunActive,
    canvasExecutionStatus,
    mostRecentSelectedNodeId,
    mostRecentSelectedNodeName,
    mostRecentPanelHeight,
    handleMostRecentResize,
    handleMostRecentNodeSelect,
    handleCloseMostRecentRunPanel,
  } = useBuilderLiveRunPanel({
    mostRecentExecutionId,
    mostRecentRunPanelOpen,
    executionStatus: mostRecentExecution?.status,
    isViewingExecution: false,
    onClosePanel: () => dispatch({ type: 'CLOSE_MOST_RECENT_RUN_PANEL' }),
  })

  const { runStepDialog, lastRunStepNodeIdRef, pinnedMockDataForDialog, handleRunStep } = useRunStepDialog(
    handleSaveWorkflow,
    isTerminalStatus
  )
  const [pendingImport, setPendingImport] = useState<import('./useWorkflowImportExport').PendingImportData | null>(null)
  const {
    handleRunWorkflow,
    handleDeleteWorkflow,
    handleToggleDetails,
    handleToggleHistory,
    handleToggleVersionHistory: baseHandleToggleVersionHistory,
  } = useBuilderToolbarHandlers({
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
    loadedVersion,
    onRunConflict: handleConflict('run'),
  })
  useEffect(() => {
    registerSaveHandler(handleSaveWorkflow)
    setActions({ handleSaveWorkflow, onPublish, handleRunWorkflow })
    return () => unregisterSaveHandler()
  }, [handleSaveWorkflow, onPublish, handleRunWorkflow, registerSaveHandler, unregisterSaveHandler, setActions])

  const versionPanel = useBuilderVersionPanel({
    workflowId,
    isNew,
    workflow,
    viewingVersion,
    versionHistoryOpen,
    dispatch,
    handleSaveWorkflow,
    workflowName,
    expandAllEvent,
    baseHandleToggleVersionHistory,
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
  const handleAddStepFromPanel = useMemo(() => createAddStepHandler(dispatch), [dispatch])
  useBuilderWindowEffects(nodesInitialized, reactFlowInstance)
  const {
    pendingApproval,
    isApprovalLoading,
    approvalViewOpen,
    approvalMessage,
    wrappedHandleNodeClick,
    handleApprovalClose,
    handleApprovalDismiss,
    openApprovalView,
  } = useBuilderApproval({
    mostRecentExecutionId,
    showMostRecentRunPanelInEditor,
    currentWorkflow,
    handleNodeClick,
    isLiveRunActive,
  })
  const builderPermissions = useBuilderPermissions(isNew, currentWorkflow?.is_builtin === true)
  const triggers = currentWorkflow?.triggers ?? []
  const nodeExpandedAllContextValue = useMemo(
    () => ({ expandAllEvent, collapseAllEvent }),
    [expandAllEvent, collapseAllEvent]
  )
  const dialogProps = useBuilderDialogProps({
    workflowName,
    workflowId,
    confirmDialogOpen,
    deleteDialogOpen,
    selectedTriggerIndex,
    currentWorkflow,
    dispatch,
    handleRunWorkflow,
    handleDeleteWorkflow,
    runStepDialog,
    lastRunStepNodeIdRef,
    pendingImport,
    setPendingImport,
    selectedProject: stableProjectId ? { id: stableProjectId } : null,
    createWorkflow: createWorkflow as UseBuilderSaveWorkflowParams['createWorkflow'],
    setLocation,
    pinnedMockDataForDialog,
  })
  return (
    <NodeActionsContext.Provider value={nodeActionsValue}>
      <NodeExpandedAllContext.Provider value={nodeExpandedAllContextValue}>
        <VersionViewProvider value={versionPanel.isViewingVersion}>
          <NxPage>
            <NxReactFlowViewportGuard>
              <Stack hasGutter>
                <StackItem>
                  <BuilderWorkflowPageHeader
                    workflowName={workflowName}
                    workflowDescription={workflowDescription}
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
                    handleToggleVersionHistory={versionPanel.handleToggleVersionHistory}
                    handleToggleDetails={handleToggleDetails}
                    handleSaveWorkflow={handleSaveWorkflow}
                    onPublish={onPublish}
                    onUnpublish={onUnpublish}
                    onPendingImport={setPendingImport}
                    isLiveRunActive={isLiveRunActive}
                    executionId={mostRecentExecutionId}
                    executionStatus={mostRecentExecution?.status}
                    onBackToEditor={isLiveRunActive ? handleCloseMostRecentRunPanel : undefined}
                    hasApprovalPending={!!pendingApproval}
                    isApprovalLoading={isApprovalLoading}
                    isApprovalPanelOpen={approvalViewOpen}
                    onReviewApproval={openApprovalView}
                    triggers={triggers}
                    isAddNodePanelOpen={isAddNodePanelOpen}
                    hasNoWorkflowNodes={hasNoWorkflowNodes}
                    isBuiltin={currentWorkflow?.is_builtin === true}
                    builderPermissions={builderPermissions}
                    isViewingVersion={versionPanel.isViewingVersion}
                    versionHistoryOpen={versionHistoryOpen}
                    viewedVersionDate={versionPanel.viewedVersionDate}
                    viewedVersionStatus={versionPanel.viewedVersionStatus}
                    onExitVersionView={versionPanel.handleExitVersionView}
                    onRestoreVersion={versionPanel.openRestoreDialogForCurrentVersion}
                  />
                </StackItem>
                <BuilderReadOnlyBanner
                  canEdit={builderPermissions.canEdit}
                  isLoading={builderPermissions.isLoading}
                  isBuiltin={currentWorkflow?.is_builtin === true}
                />
                <ValidationBanner
                  errors={state.validationErrors}
                  dismissed={state.validationBannerDismissed}
                  dispatch={dispatch}
                  onNavigateToNode={handleNavigateToNode}
                />
                <StackItem isFilled className={styles.filledMinHeight}>
                  <Flex
                    alignItems={{ default: 'alignItemsStretch' }}
                    flexWrap={{ default: 'nowrap' }}
                    gap={{ default: 'gapSm' }}
                    className={styles.canvasFlex}
                  >
                    <FlexItem
                      className={styles.canvasFlexItem}
                      style={{ pointerEvents: isNodeEditorOpen && !versionPanel.isViewingVersion ? 'none' : 'auto' }}
                    >
                      <Stack className={styles.canvasStack}>
                        <StackItem isFilled className={styles.filledMinHeight}>
                          <NxPanel hasNoPadding isFullHeight className={styles.canvasPanel}>
                            <VersionInfoCard
                              title={versionPanel.viewedVersionPublishName}
                              date={versionPanel.viewedVersionDate}
                              description={versionPanel.viewedVersionDescription}
                            />
                            <BuilderFlow
                              workflowId={workflowId}
                              readOnly={versionPanel.isViewingVersion}
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
                          <ExecutionDetailsPanelWrapper
                            executionId={mostRecentExecutionId}
                            workflowDefinition={
                              workflow?.version?.workflow_definition as Parameters<
                                typeof ExecutionDetailsPanelWrapper
                              >[0]['workflowDefinition']
                            }
                            selectedNodeId={mostRecentSelectedNodeId}
                            selectedNodeName={mostRecentSelectedNodeName}
                            onNodeSelect={handleMostRecentNodeSelect}
                            panelHeight={mostRecentPanelHeight}
                            onResize={handleMostRecentResize}
                            isTerminalStatus={isTerminalStatus}
                            onClosePanel={handleCloseMostRecentRunPanel}
                          />
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

                    {!isNodeEditorOpen && approvalViewOpen && pendingApproval && (
                      <FlexItem className={styles.approvalPanelSlot}>
                        <ApprovalSidePanel
                          approval={pendingApproval}
                          message={approvalMessage}
                          onClose={handleApprovalClose}
                          onDecisionSubmitted={handleApprovalDismiss}
                        />
                      </FlexItem>
                    )}

                    <VersionHistorySidePanel
                      sidePanel={versionPanel.versionSidePanel}
                      isNodeEditorOpen={isNodeEditorOpen}
                      editPermission={{
                        canEdit: builderPermissions.canEdit,
                        tooltip: builderPermissions.tooltips.edit,
                      }}
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
                      onAddStep={handleAddStepFromPanel}
                      projectId={(workflow as unknown as { project_id?: string })?.project_id ?? selectedProject?.id}
                      workflowMetadata={workflowMetadata}
                      onRunStep={selectedNode ? () => detachPromise(handleRunStep(selectedNode.id)) : undefined}
                    />
                  </Flex>
                </StackItem>
              </Stack>
            </NxReactFlowViewportGuard>

            <BuilderDialogs {...dialogProps} conflictDialogProps={conflictDialogProps} />
          </NxPage>
        </VersionViewProvider>
      </NodeExpandedAllContext.Provider>
    </NodeActionsContext.Provider>
  )
}
