import type { Execution, WorkflowAPI } from '@ansible/nexus-contracts'
import { Content, Flex, FlexItem, Stack, StackItem } from '@patternfly/react-core'
import { useQueryClient } from '@tanstack/react-query'
import { useReactFlow, useNodesInitialized } from '@xyflow/react'
import { useEffect, useMemo, useReducer, useState, type CSSProperties } from 'react'
import { useLocation } from 'wouter'

import { AppPage } from '../../app/AppPage'
import { useUnsavedChanges } from '../../app/useUnsavedChanges'
import { executionsClient, workflowClient } from '../../client'
import { useAlerts } from '../../components/alerts'
import { AppPanel } from '../../components/AppPanel'
import { ConfirmationDialog } from '../../components/ConfirmationDialog'
import { useProjectSelector } from '../../hooks/useProjectSelector'
import { useWorkflowStore } from '../../stores/useWorkflowStore'
import type { FilterConfig } from '../../types/filters'
import { NodeExpandedAllContext } from '../workflows/canvas/nodes/common/NodeExpandedAllContext'

import { AddNodePanel } from './AddNodePanel'
import { BuilderFlow } from './BuilderFlow'
import { builderReducer, getInitialBuilderState } from './builderReducer'
import { BuilderWorkflowAppPageHeader } from './BuilderWorkflowAppPageHeader'
import { NodeEditorOverlay } from './components/NodeEditorOverlay'
import { ExecutionDetailsPanel } from './ExecutionDetailsPanel'
import { ExecutionViewContent } from './ExecutionViewContent'
// buildNestedConditionStructure removed — v2 uses flat nodes + edges
import { useBuilderContentQueries } from './hooks/useBuilderContentQueries'
import { useBuilderDerivedUiFlags } from './hooks/useBuilderDerivedUiFlags'
import { useBuilderExecutionCanvasState } from './hooks/useBuilderExecutionCanvasState'
import { useBuilderFlowInteractionHandlers } from './hooks/useBuilderFlowInteractionHandlers'
import { useBuilderSaveWorkflow, type UseBuilderSaveWorkflowParams } from './hooks/useBuilderSaveWorkflow'
import { useBuilderToolbarHandlers } from './hooks/useBuilderToolbarHandlers'
import { useBuilderWindowEffects } from './hooks/useBuilderWindowEffects'
import { useBuilderWorkflowLifecycle } from './hooks/useBuilderWorkflowLifecycle'
import { useUndoRedoKeyboard } from './hooks/useUndoRedoKeyboard'
import { NodeActionsContext } from './NodeActionsContext'
import { WorkflowHistoryCard } from './WorkflowHistoryCard'
// loadWorkflow and validateRoundTrip removed — v2 activities are already flat
import { WorkflowSidepanel } from './WorkflowSidepanel'

// Type aliases from API contracts
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
  const { selectedProject, ProjectSelector } = useProjectSelector({ requireProject: isNew })
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
  const { registerSaveHandler, unregisterSaveHandler } = useUnsavedChanges()

  const [executionFilters, setExecutionFilters] = useState<FilterConfig[]>([])

  const [state, dispatch] = useReducer(builderReducer, getInitialBuilderState())
  const {
    confirmDialogOpen,
    deleteDialogOpen,
    detailsOpen,
    historyCardOpen,
    selectedExecutionId,
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
  } = state

  const expandAllEvent = useMemo(() => new EventTarget(), [])
  const collapseAllEvent = useMemo(() => new EventTarget(), [])
  const { hasNoWorkflowNodes, isAddNodePanelOpen, isNodeEditorOpen } = useBuilderDerivedUiFlags(
    currentWorkflow,
    addNodePanelOpen,
    nodeEditorMode
  )

  useUndoRedoKeyboard({ disabled: isNodeEditorOpen || !!selectedExecutionId })

  useEffect(() => {
    return () => useWorkflowStore.temporal.getState().clear()
  }, [])

  const { executionsQuery, selectedExecutionQuery, workflowsListQuery } = useBuilderContentQueries({
    workflowId,
    isNew,
    executionFilters,
    selectedExecutionId,
    historyCardOpen,
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
    markClean,
    createWorkflow: createWorkflow as UseBuilderSaveWorkflowParams['createWorkflow'],
    updateWorkflow,
  })

  // Register save handler with the unsaved changes context
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
    })

  const { selectedExecution, executionWorkflow, executionActivities, isViewingExecution } =
    useBuilderExecutionCanvasState(
      historyCardOpen,
      selectedExecutionId,
      executionsQuery,
      selectedExecutionQuery as { data?: Execution },
      dispatch
    )

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

  const nodeExpandedAllContextValue = useMemo(
    () => ({ expandAllEvent, collapseAllEvent }),
    [expandAllEvent, collapseAllEvent]
  )

  /** Extra gutter so glass/raised panel shadows fit between canvas, run details, and run history without hard cuts */
  const widenExecutionChrome = isViewingExecution && !!selectedExecutionId

  const executionChromeInsetStyle: CSSProperties = widenExecutionChrome
    ? {
        /* Extra inset inside scrollport so top/bottom/side panel shadows clear before `compass__content` clips */
        paddingInline: 'var(--pf-t--global--spacer--sm)',
        paddingBlockStart: 'var(--pf-t--global--spacer--xs)',
        paddingBlockEnd: 'var(--pf-t--global--spacer--sm)',
      }
    : {}

  const executionFilledStackItemStyle: CSSProperties = {
    minHeight: 0,
    ...executionChromeInsetStyle,
  }

  const executionCanvasStackGap = widenExecutionChrome
    ? 'var(--pf-t--global--spacer--lg)'
    : 'var(--pf-t--global--spacer--sm)'

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
                isViewingExecution={isViewingExecution}
                selectedExecutionCreatedAt={selectedExecution?.created_at ?? undefined}
                historyCardOpen={historyCardOpen}
                isPending={isPending}
                selectedProject={selectedProject}
                isEnabled={isEnabled}
                isKebabOpen={isKebabOpen}
                ProjectSelector={ProjectSelector}
                dispatch={dispatch}
                markDirty={markDirty}
                handleToggleHistory={handleToggleHistory}
                handleToggleDetails={handleToggleDetails}
                handleSaveWorkflow={handleSaveWorkflow}
              />
            </StackItem>
            <StackItem isFilled style={executionFilledStackItemStyle}>
              <Flex
                alignItems={{ default: 'alignItemsStretch' }}
                flexWrap={{ default: 'nowrap' }}
                gap={{ default: widenExecutionChrome ? 'gapLg' : 'gapSm' }}
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
                      gap: executionCanvasStackGap,
                    }}
                  >
                    <StackItem
                      isFilled
                      style={{
                        minHeight: 0,
                      }}
                    >
                      {isViewingExecution && selectedExecutionId ? (
                        <ExecutionViewContent
                          workflow={executionWorkflow}
                          executionStatus={selectedExecution?.status ?? null}
                          executionActivities={executionActivities}
                          executionId={selectedExecutionId}
                        />
                      ) : (
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
                          <div
                            style={{
                              height: '100%',
                              width: '100%',
                              minHeight: 0,
                              overflow: 'hidden',
                            }}
                          >
                            <BuilderFlow
                              workflowId={workflowId}
                              panelOpen={isAddNodePanelOpen || !!selectedNode}
                              activeEdgeButtonNodeId={isAddNodePanelOpen ? sourceNodeId : null}
                              activeEdgeButtonHandle={isAddNodePanelOpen ? sourceHandle : null}
                              activeEdgeId={isAddNodePanelOpen ? edgeIdToReplace : null}
                              executionStatus={null}
                              disableDeleteKey={isNodeEditorOpen}
                              disableSpacePanning={isNodeEditorOpen}
                              onNodeClick={handleNodeClick}
                              onAddNodeFromEdge={handleAddNodeFromEdge}
                              onNodesDeleted={handleNodesDeleted}
                              newNodeDesiredPosition={state.newNodeDesiredPosition}
                              onClearDesiredPosition={handleClearDesiredPosition}
                            />
                          </div>
                        </AppPanel>
                      )}
                    </StackItem>

                    {/* Execution details panel shown below canvas when viewing a run */}
                    {isViewingExecution && selectedExecutionId && (
                      <StackItem style={{ flexShrink: 0, height: '300px' }}>
                        <ExecutionDetailsPanel
                          executionId={selectedExecutionId}
                          workflowDefinition={
                            executionWorkflow?.version.workflow_definition as Parameters<
                              typeof ExecutionDetailsPanel
                            >[0]['workflowDefinition']
                          }
                        />
                      </StackItem>
                    )}
                  </Stack>
                </FlexItem>

                {isAddNodePanelOpen && !isNodeEditorOpen && (
                  <FlexItem style={{ flexShrink: 0, alignSelf: 'stretch' }}>
                    <AddNodePanel
                      onClose={() => {
                        dispatch({ type: 'CLOSE_ADD_NODE_PANEL' })
                      }}
                      onSelectNode={(nodeTypeId, nodeSubtypeId) => {
                        dispatch({
                          type: 'OPEN_NODE_EDITOR_ADD',
                          payload: { nodeTypeId, nodeSubtypeId: nodeSubtypeId ?? null },
                        })
                      }}
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
                        dispatch({ type: 'SET_SELECTED_EXECUTION_ID', payload: id })
                      }}
                      selectedExecutionId={selectedExecutionId}
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
                  executionId={selectedExecutionId}
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

          <ConfirmationDialog
            isOpen={confirmDialogOpen}
            onClose={() => dispatch({ type: 'SET_CONFIRM_DIALOG', payload: false })}
            onConfirm={handleRunWorkflow}
            title={`Run ${workflowName}?`}
            confirmLabel="Run now"
            aria-labelledby="run-workflow-modal-title"
            aria-describedby="run-workflow-modal-description"
          >
            You are about to manually run this workflow. This action will start the workflow immediately, bypassing its
            normal trigger conditions.
          </ConfirmationDialog>
          <ConfirmationDialog
            isOpen={deleteDialogOpen}
            onClose={() => dispatch({ type: 'SET_DELETE_DIALOG', payload: false })}
            onConfirm={handleDeleteWorkflow}
            title="Delete workflow?"
            confirmLabel="Delete"
            confirmVariant="danger"
            titleIconVariant="warning"
            aria-labelledby="delete-workflow-modal-title"
            aria-describedby="delete-workflow-modal-body"
            destructiveAcknowledgement={{
              checkboxId: `delete-workflow-ack-${workflowId ?? ''}`,
              label: 'I understand this workflow will be permanently deleted.',
            }}
          >
            <Stack hasGutter>
              <StackItem>
                <Content component="p">
                  The workflow <strong>{workflowName}</strong> will be deleted. This cannot be undone.
                </Content>
              </StackItem>
            </Stack>
          </ConfirmationDialog>
        </AppPage>
      </NodeExpandedAllContext.Provider>
    </NodeActionsContext.Provider>
  )
}
