import { ExecutionStatusEnum, type WorkflowAPI } from '@ansible/nexus-contracts'
import { Flex, FlexItem, Stack, StackItem } from '@patternfly/react-core'
import { useQueryClient } from '@tanstack/react-query'
import { useReactFlow, useNodesInitialized } from '@xyflow/react'
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import { useLocation } from 'wouter'

import { AppPage } from '../../app/AppPage'
import { useUnsavedChanges } from '../../app/useUnsavedChanges'
import { executionsClient, workflowClient } from '../../client'
import { useAlerts } from '../../components/alerts'
import { AppPanel } from '../../components/AppPanel'
import { ResizableDivider } from '../../components/ResizableDivider'
import { useProjectSelector } from '../../hooks/useProjectSelector'
import { useWorkflowStore } from '../../stores/useWorkflowStore'
import type { FilterConfig } from '../../types/filters'
import { NodeExpandedAllContext } from '../workflows/canvas/nodes/common/NodeExpandedAllContext'

import { AddNodePanel } from './AddNodePanel'
import { BuilderFlow } from './BuilderFlow'
import { builderReducer, getInitialBuilderState } from './builderReducer'
import { BuilderWorkflowAppPageHeader } from './BuilderWorkflowAppPageHeader'
import { BuilderDialogs } from './components/BuilderDialogs'
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
import { useUndoRedoKeyboard } from './hooks/useUndoRedoKeyboard'
import { NodeActionsContext } from './NodeActionsContext'
import { WorkflowHistoryCard } from './WorkflowHistoryCard'
import { WorkflowSidepanel } from './WorkflowSidepanel'

type WorkflowWithVersion = WorkflowAPI.components['schemas']['WorkflowWithVersion']

type BuilderContentProps = {
  workflow?: WorkflowWithVersion
  isNew: boolean
  workflowId: string | null
}

// eslint-disable-next-line max-lines-per-function, complexity
export function BuilderContent(props: BuilderContentProps) {
  const { workflow, isNew, workflowId } = props
  const [, setLocation] = useLocation()
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
    markClean,
    markDirty,
    duplicateActivity,
  } = useWorkflowStore()
  const { registerSaveHandler, unregisterSaveHandler, requestNavigation } = useUnsavedChanges()

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
    isEnabled,
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

  const { mutate: createWorkflow, isPending: isCreating } = workflowClient.useMutation('post', '/workflows')
  const { mutate: updateWorkflow, isPending: isUpdating } = workflowClient.useMutation(
    'patch',
    '/workflows/{workflow_id}'
  )
  const { mutate: executeWorkflow } = executionsClient.useMutation('post', '/executions')
  const { mutate: deleteWorkflow } = workflowClient.useMutation('delete', '/workflows/{workflow_id}')

  const isPending = isCreating || isUpdating

  const handleSaveWorkflow = useBuilderSaveWorkflow({
    currentWorkflow,
    workflowName,
    workflowDescription,
    workflowTags,
    isEnabled,
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
  })

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

  const isTerminalStatus =
    mostRecentExecution?.status === ExecutionStatusEnum.COMPLETED ||
    mostRecentExecution?.status === ExecutionStatusEnum.FAILED ||
    mostRecentExecution?.status === ExecutionStatusEnum.CANCELLED
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
  })

  const triggers = currentWorkflow?.triggers ?? []
  const selectedTrigger = triggers[selectedTriggerIndex] ?? triggers[0]
  const triggerName = selectedTrigger?.name ?? 'Trigger'
  const triggerNodeId = selectedTrigger?.id
  const triggerInputSchema = selectedTrigger?.config?.input_schema as Record<string, unknown> | undefined

  const nodeExpandedAllContextValue = useMemo(
    () => ({ expandAllEvent, collapseAllEvent }),
    [expandAllEvent, collapseAllEvent]
  )

  return (
    <NodeActionsContext.Provider value={nodeActionsValue}>
      <NodeExpandedAllContext.Provider value={nodeExpandedAllContextValue}>
        <AppPage>
          <Stack hasGutter>
            <StackItem>
              <BuilderWorkflowAppPageHeader
                workflowName={workflowName}
                workflowDescription={workflowDescription}
                workflowTags={workflowTags}
                isNew={isNew}
                workflow={workflow?.id ? { id: workflow.id } : undefined}
                historyCardOpen={historyCardOpen}
                isPending={isPending}
                isEnabled={isEnabled}
                isKebabOpen={isKebabOpen}
                ProjectSelector={ProjectSelector}
                dispatch={dispatch}
                markDirty={markDirty}
                handleToggleHistory={handleToggleHistory}
                handleToggleDetails={handleToggleDetails}
                handleSaveWorkflow={handleSaveWorkflow}
                isLiveRunActive={isLiveRunActive}
                onBackToEditor={isLiveRunActive ? handleCloseMostRecentRunPanel : undefined}
                hasApprovalPending={!!pendingApproval}
                isApprovalLoading={isApprovalLoading}
                onReviewApproval={openApprovalView}
                triggers={triggers}
              />
            </StackItem>
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
                      <AppPanel
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
                        />
                      </AppPanel>
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
                {isAddNodePanelOpen && !isNodeEditorOpen && (
                  <FlexItem style={{ flexShrink: 0, alignSelf: 'stretch' }}>
                    <AddNodePanel
                      onClose={() => dispatch({ type: 'CLOSE_ADD_NODE_PANEL' })}
                      onSelectNode={(nodeTypeId, nodeSubtypeId) =>
                        dispatch({
                          type: 'OPEN_NODE_EDITOR_ADD',
                          payload: { nodeTypeId, nodeSubtypeId: nodeSubtypeId ?? null },
                        })
                      }
                      sourceNodeId={sourceNodeId}
                      replacementNodeId={replacementNodeId}
                      hasNoWorkflowNodes={hasNoWorkflowNodes}
                    />
                  </FlexItem>
                )}

                {!isNodeEditorOpen && historyCardOpen && !isNew && (
                  <FlexItem style={{ flexShrink: 0, alignSelf: 'stretch' }}>
                    <WorkflowHistoryCard
                      executions={executionsQuery.data?.resources ?? []}
                      onClose={() => dispatch({ type: 'SET_HISTORY_CARD_OPEN', payload: false })}
                      onExecutionSelect={(id) => {
                        requestNavigation(`/executions/${id}`)
                      }}
                      filters={executionFilters}
                      onFilterChange={setExecutionFilters}
                    />
                  </FlexItem>
                )}

                {!isNodeEditorOpen && detailsOpen && workflow && (
                  <FlexItem style={{ flexShrink: 0, alignSelf: 'stretch' }}>
                    <WorkflowSidepanel
                      workflow={workflow}
                      workflowName={workflowName}
                      workflowDescription={workflowDescription}
                      onNameChange={(name) => {
                        dispatch({ type: 'SET_WORKFLOW_NAME', payload: name })
                        markDirty()
                      }}
                      onDescriptionChange={(desc) => {
                        dispatch({ type: 'SET_WORKFLOW_DESCRIPTION', payload: desc })
                        markDirty()
                      }}
                      onClose={() => dispatch({ type: 'SET_DETAILS_OPEN', payload: false })}
                    />
                  </FlexItem>
                )}

                <NodeEditorOverlay
                  isOpen={isNodeEditorOpen}
                  mode={nodeEditorMode}
                  selectedNode={selectedNode}
                  nodeTypeId={nodeEditorNodeTypeId}
                  nodeSubtypeId={nodeEditorNodeSubtypeId}
                  sourceNodeId={sourceNodeId}
                  replacementNodeId={replacementNodeId}
                  executionId={null}
                  workflowId={workflowId}
                  onConnect={handleConnectFromPanel}
                  onClose={() => dispatch({ type: 'CLOSE_NODE_EDITOR' })}
                  projectId={
                    // TODO: Remove cast when project_id is added to the OpenAPI spec
                    (workflow as unknown as { project_id?: string })?.project_id ?? selectedProject?.id
                  }
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
            triggerName={triggerName}
            triggerNodeId={triggerNodeId}
            triggerInputSchema={triggerInputSchema}
          />
        </AppPage>
      </NodeExpandedAllContext.Provider>
    </NodeActionsContext.Provider>
  )
}
