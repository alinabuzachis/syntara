import type { WorkflowAPI } from '@ansible/nexus-contracts'
import {
  Button,
  CompassPanel,
  Divider,
  Dropdown,
  DropdownItem,
  DropdownList,
  Flex,
  FlexItem,
  Icon,
  List,
  ListItem,
  MenuToggle,
  type MenuToggleElement,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Stack,
  StackItem,
  Switch,
  TextInput,
  Tooltip,
} from '@patternfly/react-core'
import {
  RhUiPlayIcon,
  RhUiHistoryIcon,
  RhUiCodeIcon,
  RhUiSaveFillIcon,
  RhUiTrashIcon,
  RhUiEllipsisVerticalFillIcon,
  RhUiAddSquareIcon,
} from '@patternfly/react-icons'
import { useQueryClient, type Query } from '@tanstack/react-query'
import { useReactFlow, useNodesInitialized, type Node } from '@xyflow/react'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useLocation } from 'wouter'

import { AppPage } from '../../app/AppPage'
import { AppPageHeader } from '../../app/AppPageHeader'
import { useUnsavedChanges } from '../../app/useUnsavedChanges'
import { workflowClient } from '../../client'
import { useAlerts } from '../../components/alerts'
import { FlowNodeType } from '../../constants'
import { useWorkflowStore } from '../../stores/useWorkflowStore'
import { getErrorMessage } from '../../utils/apiErrors'
import { buildTriggerNodeId } from '../../utils/triggerNodeIds'
import { NodeExpandedAllContext } from '../automations/canvas/nodes/common/NodeExpandedAllContext'
import type { NodeType } from '../automations/canvas/nodes/NodeType'

import { AddNodePanel } from './AddNodePanel'
import { AutomationHistoryCard } from './AutomationHistoryCard'
import { BuilderFlow } from './BuilderFlow'
import { NodeEditorOverlay } from './components/NodeEditorOverlay'
import { buildNestedConditionStructure } from './utils/buildNestedStructure'
import { EdgeFactory } from './utils/EdgeFactory'
import { ACTIVITY_TYPES } from './utils/executionState/executionHelpers'
import { loadWorkflow } from './utils/loadWorkflow'
import { validateRoundTrip, validateSavePath } from './utils/validateRoundTrip'
import { validateWorkflow } from './utils/validation'
import type { EdgeType } from './utils/workflowToGraph'
import { WorkflowTransform } from './utils/workflowTransform'
import { WorkflowSidepanel } from './WorkflowSidepanel'

// Type aliases from API contracts
type Workflow = WorkflowAPI.components['schemas']['Workflow']
type WorkflowInput = WorkflowAPI.paths['/workflows']['post']['requestBody']['content']['application/json']
type WorkflowDefinition = WorkflowAPI.components['schemas']['workflow-definition.schema']

interface BuilderContentProps {
  workflow?: Workflow
  isNew: boolean
  workflowId: string | null
}

// v8 ignore start - Helper functions only called from React Flow callbacks (E2E tested)
function hasConditionNodePlaceholders(nodes: Node[], sourceId: string): boolean {
  return nodes.some((n) => n.id === `placeholder-${sourceId}-true` || n.id === `placeholder-${sourceId}-false`)
}

function hasLoopNodePlaceholders(nodes: Node[], sourceId: string): boolean {
  return nodes.some((n) => n.id === `placeholder-${sourceId}-done` || n.id === `placeholder-${sourceId}-loop`)
}

function removeButtonEdgeClass(nodes: Node[], sourceId: string): Node[] {
  return nodes.map((n) => {
    if (n.id === sourceId) {
      const className = (n.className || '').replace('has-button-edge', '').trim()
      return { ...n, className }
    }
    return n
  })
}

function isWorkflowQuery(query: Query): boolean {
  return (
    query.queryKey[0] === 'get' && typeof query.queryKey[1] === 'string' && query.queryKey[1].startsWith('/workflows')
  )
}
// v8 ignore stop

// State interface for useReducer
interface BuilderState {
  confirmDialogOpen: boolean
  deleteDialogOpen: boolean
  detailsOpen: boolean
  historyCardOpen: boolean
  isKebabOpen: boolean
  addNodePanelOpen: boolean
  nodeEditorMode: 'add' | 'edit' | null
  nodeEditorNodeTypeId: string | null
  nodeEditorNodeSubtypeId: string | null
  selectedNode: Node<NodeType['data']> | null
  sourceNodeId: string | null
  targetNodeId: string | null
  edgeIdToReplace: string | null
  sourceHandle: string | undefined
  targetHandle: string | undefined
  replacementNodeId: string | null
  workflowName: string
  workflowDescription: string
  isEnabled: boolean
}

// Action types for reducer
type BuilderAction =
  | { type: 'SET_CONFIRM_DIALOG'; payload: boolean }
  | { type: 'SET_DELETE_DIALOG'; payload: boolean }
  | { type: 'SET_DETAILS_OPEN'; payload: boolean }
  | { type: 'TOGGLE_DETAILS' }
  | { type: 'SET_HISTORY_CARD_OPEN'; payload: boolean }
  | { type: 'TOGGLE_HISTORY' }
  | { type: 'SET_KEBAB_OPEN'; payload: boolean }
  | { type: 'SET_ADD_NODE_PANEL'; payload: boolean }
  | { type: 'OPEN_NODE_EDITOR_ADD'; payload: { nodeTypeId: string; nodeSubtypeId: string | null } }
  | { type: 'CLOSE_NODE_EDITOR' }
  | { type: 'SET_SELECTED_NODE'; payload: Node<NodeType['data']> | null }
  | { type: 'SET_SOURCE_NODE_ID'; payload: string | null }
  | { type: 'SET_TARGET_NODE_ID'; payload: string | null }
  | { type: 'SET_EDGE_ID_TO_REPLACE'; payload: string | null }
  | { type: 'SET_SOURCE_HANDLE'; payload: string | undefined }
  | { type: 'SET_TARGET_HANDLE'; payload: string | undefined }
  | { type: 'SET_REPLACEMENT_NODE_ID'; payload: string | null }
  | { type: 'SET_WORKFLOW_NAME'; payload: string }
  | { type: 'SET_WORKFLOW_DESCRIPTION'; payload: string }
  | { type: 'SET_IS_ENABLED'; payload: boolean }
  | {
      type: 'OPEN_ADD_NODE_FROM_EDGE'
      payload: { sourceId: string; targetId?: string; edgeId?: string; handle?: string; targetHandle?: string }
    }
  | { type: 'OPEN_ADD_NODE_PANEL'; payload: { sourceNodeId: string | null; replacementNodeId: string | null } }
  | { type: 'CLOSE_ADD_NODE_PANEL' }
  | { type: 'CLOSE_OTHER_PANELS' }
  | { type: 'NODE_CLICK'; payload: { node: Node<NodeType['data']>; isGeneric: boolean } }
  | { type: 'CLEAR_SELECTED_IF_DELETED'; payload: string[] }
  | { type: 'INIT_WORKFLOW'; payload: { name: string; description: string; isEnabled: boolean } }

// Reducer function
function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case 'SET_CONFIRM_DIALOG':
      return { ...state, confirmDialogOpen: action.payload }
    case 'SET_DELETE_DIALOG':
      return { ...state, deleteDialogOpen: action.payload }
    case 'SET_DETAILS_OPEN':
      return { ...state, detailsOpen: action.payload }
    case 'TOGGLE_DETAILS':
      return {
        ...state,
        detailsOpen: !state.detailsOpen,
        addNodePanelOpen: !state.detailsOpen ? false : state.addNodePanelOpen,
        historyCardOpen: !state.detailsOpen ? false : state.historyCardOpen,
        selectedNode: !state.detailsOpen ? null : state.selectedNode,
        nodeEditorMode: !state.detailsOpen ? null : state.nodeEditorMode,
        nodeEditorNodeTypeId: !state.detailsOpen ? null : state.nodeEditorNodeTypeId,
        nodeEditorNodeSubtypeId: !state.detailsOpen ? null : state.nodeEditorNodeSubtypeId,
      }
    case 'SET_HISTORY_CARD_OPEN':
      return { ...state, historyCardOpen: action.payload }
    case 'TOGGLE_HISTORY':
      return {
        ...state,
        historyCardOpen: !state.historyCardOpen,
        addNodePanelOpen: !state.historyCardOpen ? false : state.addNodePanelOpen,
        detailsOpen: !state.historyCardOpen ? false : state.detailsOpen,
        selectedNode: !state.historyCardOpen ? null : state.selectedNode,
        nodeEditorMode: !state.historyCardOpen ? null : state.nodeEditorMode,
        nodeEditorNodeTypeId: !state.historyCardOpen ? null : state.nodeEditorNodeTypeId,
        nodeEditorNodeSubtypeId: !state.historyCardOpen ? null : state.nodeEditorNodeSubtypeId,
      }
    case 'SET_KEBAB_OPEN':
      return { ...state, isKebabOpen: action.payload }
    case 'SET_ADD_NODE_PANEL':
      return { ...state, addNodePanelOpen: action.payload }
    case 'OPEN_NODE_EDITOR_ADD':
      return {
        ...state,
        nodeEditorMode: 'add',
        nodeEditorNodeTypeId: action.payload.nodeTypeId,
        nodeEditorNodeSubtypeId: action.payload.nodeSubtypeId,
        selectedNode: null,
        addNodePanelOpen: false,
      }
    case 'CLOSE_NODE_EDITOR':
      return {
        ...state,
        nodeEditorMode: null,
        nodeEditorNodeTypeId: null,
        nodeEditorNodeSubtypeId: null,
        selectedNode: null,
      }
    case 'SET_SELECTED_NODE':
      return { ...state, selectedNode: action.payload }
    case 'SET_SOURCE_NODE_ID':
      return { ...state, sourceNodeId: action.payload }
    case 'SET_TARGET_NODE_ID':
      return { ...state, targetNodeId: action.payload }
    case 'SET_EDGE_ID_TO_REPLACE':
      return { ...state, edgeIdToReplace: action.payload }
    case 'SET_SOURCE_HANDLE':
      return { ...state, sourceHandle: action.payload }
    case 'SET_TARGET_HANDLE':
      return { ...state, targetHandle: action.payload }
    case 'SET_REPLACEMENT_NODE_ID':
      return { ...state, replacementNodeId: action.payload }
    case 'SET_WORKFLOW_NAME':
      return { ...state, workflowName: action.payload }
    case 'SET_WORKFLOW_DESCRIPTION':
      return { ...state, workflowDescription: action.payload }
    case 'SET_IS_ENABLED':
      return { ...state, isEnabled: action.payload }
    case 'OPEN_ADD_NODE_FROM_EDGE':
      return {
        ...state,
        nodeEditorMode: null,
        nodeEditorNodeTypeId: null,
        nodeEditorNodeSubtypeId: null,
        selectedNode: null,
        detailsOpen: false,
        historyCardOpen: false,
        sourceNodeId: action.payload.sourceId,
        targetNodeId: action.payload.targetId || null,
        edgeIdToReplace: action.payload.edgeId || null,
        sourceHandle: action.payload.handle || undefined,
        targetHandle: action.payload.targetHandle,
        replacementNodeId: null,
        addNodePanelOpen: true,
      }
    case 'OPEN_ADD_NODE_PANEL':
      return {
        ...state,
        nodeEditorMode: null,
        nodeEditorNodeTypeId: null,
        nodeEditorNodeSubtypeId: null,
        selectedNode: null,
        detailsOpen: false,
        historyCardOpen: false,
        sourceNodeId: action.payload.sourceNodeId,
        targetNodeId: null,
        edgeIdToReplace: null,
        sourceHandle: undefined,
        targetHandle: undefined,
        replacementNodeId: action.payload.replacementNodeId,
        addNodePanelOpen: true,
      }
    case 'CLOSE_ADD_NODE_PANEL':
      return {
        ...state,
        addNodePanelOpen: false,
        nodeEditorMode: null,
        nodeEditorNodeTypeId: null,
        nodeEditorNodeSubtypeId: null,
        sourceNodeId: null,
        targetNodeId: null,
        edgeIdToReplace: null,
        sourceHandle: undefined,
        targetHandle: undefined,
        replacementNodeId: null,
      }
    case 'CLOSE_OTHER_PANELS':
      return {
        ...state,
        selectedNode: null,
        detailsOpen: false,
        historyCardOpen: false,
      }
    case 'NODE_CLICK':
      if (action.payload.isGeneric) {
        return {
          ...state,
          nodeEditorMode: null,
          nodeEditorNodeTypeId: null,
          nodeEditorNodeSubtypeId: null,
          selectedNode: null,
          detailsOpen: false,
          historyCardOpen: false,
          sourceNodeId: null,
          replacementNodeId: action.payload.node.id,
          addNodePanelOpen: true,
        }
      } else {
        return {
          ...state,
          selectedNode: action.payload.node,
          nodeEditorMode: 'edit',
          nodeEditorNodeTypeId: null,
          nodeEditorNodeSubtypeId: null,
          addNodePanelOpen: false,
          detailsOpen: false,
          historyCardOpen: false,
          replacementNodeId: null,
        }
      }
    case 'CLEAR_SELECTED_IF_DELETED':
      if (state.selectedNode && action.payload.includes(state.selectedNode.id)) {
        return { ...state, selectedNode: null }
      }
      return state
    case 'INIT_WORKFLOW':
      return {
        ...state,
        workflowName: action.payload.name,
        workflowDescription: action.payload.description,
        isEnabled: action.payload.isEnabled,
      }
    default:
      return state
  }
}

// Initial state factory
function getInitialState(): BuilderState {
  return {
    confirmDialogOpen: false,
    deleteDialogOpen: false,
    detailsOpen: false,
    historyCardOpen: false,
    isKebabOpen: false,
    addNodePanelOpen: false,
    nodeEditorMode: null,
    nodeEditorNodeTypeId: null,
    nodeEditorNodeSubtypeId: null,
    selectedNode: null,
    sourceNodeId: null,
    targetNodeId: null,
    edgeIdToReplace: null,
    sourceHandle: undefined,
    targetHandle: undefined,
    replacementNodeId: null,
    workflowName: 'New workflow',
    workflowDescription: 'New workflow',
    isEnabled: false,
  }
}

export function BuilderContent(props: BuilderContentProps) {
  const { workflow, isNew, workflowId } = props
  const [, setLocation] = useLocation()
  const { showSuccess, showError } = useAlerts()
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
  } = useWorkflowStore()
  const { registerSaveHandler, unregisterSaveHandler } = useUnsavedChanges()

  const [state, dispatch] = useReducer(builderReducer, getInitialState())
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
    isEnabled,
  } = state

  const expandAllEvent = useMemo(() => new EventTarget(), [])
  const collapseAllEvent = useMemo(() => new EventTarget(), [])
  const hasNoWorkflowNodes = useMemo(() => {
    if (!currentWorkflow) {
      return false
    }
    const triggers = currentWorkflow.triggers ?? []
    const activities = currentWorkflow.workflow?.activities ?? []
    return triggers.length === 0 && activities.length === 0
  }, [currentWorkflow])
  const isAddNodePanelOpen = addNodePanelOpen || hasNoWorkflowNodes
  const isNodeEditorOpen = nodeEditorMode !== null

  // Fetch executions for history panel (only if not new workflow)
  const executionsQuery = workflowClient.useQuery(
    'get',
    '/executions',
    {
      params: { query: { workflow_id: workflowId ?? '' } },
    },
    {
      enabled: !!workflowId && !isNew,
      staleTime: 30000, // Consider fresh for 30 seconds
      gcTime: 300000, // Keep in cache for 5 minutes
    }
  )

  // Track if we've loaded the workflow for the first time
  const hasLoadedRef = useRef(false)

  // Clear workflow store when workflowId changes to ensure fresh state
  const prevWorkflowIdRef = useRef(workflowId)
  useEffect(() => {
    if (prevWorkflowIdRef.current !== workflowId) {
      setWorkflow(null)
      setStoredEdges([])
      hasLoadedRef.current = false
      prevWorkflowIdRef.current = workflowId
    }
  }, [workflowId, setWorkflow, setStoredEdges])

  useEffect(() => {
    if (isNew) {
      const newWorkflow: WorkflowDefinition = {
        schemaVersion: '1.0.0',
        version: 1,
        metadata: {
          name: 'New workflow',
          description: 'New workflow',
        },
        workflow: {
          activities: [],
        },
      }
      queueMicrotask(() => {
        // Use atomic operation for consistency
        loadWorkflowWithEdges(newWorkflow, [])
        dispatch({
          type: 'INIT_WORKFLOW',
          payload: { name: 'New workflow', description: 'New workflow', isEnabled: false },
        })
        // No need for markClean - loadWorkflowWithEdges sets isDirty: false
      })
    } else if (
      workflow &&
      (workflow as unknown as { version?: { workflow_definition?: WorkflowDefinition } }).version
        ?.workflow_definition &&
      !hasLoadedRef.current &&
      workflow.id === workflowId
    ) {
      // Load existing workflow - ONLY on first load, not during refetch after save
      // This prevents overwriting user-created edges (including ButtonEdges) with saved edges
      // CRITICAL: Only load if workflow.id matches workflowId (prevents loading stale cached workflow)
      const workflowDef = (workflow as unknown as { version: { workflow_definition: WorkflowDefinition } }).version
        .workflow_definition

      // Use combined load function - performs edge generation AND flattening in single pass
      // This is more efficient than calling generateEdgesFromStructure + flattenConditionStructure separately
      const { activities: flattenedActivities, edges: generatedEdges } = loadWorkflow(workflowDef.workflow.activities)

      // Generate trigger edges (triggers connect to first activities)
      const triggers = workflowDef.triggers || []
      if (triggers.length > 0 && workflowDef.workflow.activities.length > 0) {
        const firstActivity = workflowDef.workflow.activities[0]

        triggers.forEach((_, index) => {
          // If first activity is a parallel (either auto-generated wrapper OR user-created), connect to its branches
          if (firstActivity.type === ACTIVITY_TYPES.PARALLEL) {
            const branches = firstActivity.branches || []
            branches.forEach((branch) => {
              // CRITICAL: Use getFirstActivityId to handle sequence wrappers that will be flattened away
              const targetId = WorkflowTransform.getFirstActivityId(branch)
              const triggerId = buildTriggerNodeId(index)
              generatedEdges.push({
                id: `${triggerId}-${targetId}`,
                source: triggerId,
                target: targetId,
                sourceHandle: 'source',
                targetHandle: 'target',
              })
            })
          } else {
            // Regular activity - use getFirstActivityId to handle sequences
            const targetId = WorkflowTransform.getFirstActivityId(firstActivity)
            const triggerId = buildTriggerNodeId(index)
            generatedEdges.push({
              id: `${triggerId}-${targetId}`,
              source: triggerId,
              target: targetId,
              sourceHandle: 'source',
              targetHandle: 'target',
            })
          }
        })
      }

      // Validate round-trip conversion (development only)
      // This ensures the workflow structure is preserved during load → edit → save
      validateRoundTrip(workflowDef.workflow.activities, generatedEdges)

      const flattenedWorkflow: WorkflowDefinition = {
        ...workflowDef,
        workflow: {
          ...workflowDef.workflow,
          activities: flattenedActivities,
        },
      }

      queueMicrotask(() => {
        // Use atomic operation to set both workflow and edges together
        // This prevents race conditions where BuilderFlow renders with workflow but no edges
        // Note: loadWorkflowWithEdges already sets isDirty to false
        loadWorkflowWithEdges(flattenedWorkflow, generatedEdges)
        dispatch({
          type: 'INIT_WORKFLOW',
          payload: {
            name: workflow.name,
            description: workflow.description ?? workflow.name ?? 'New workflow',
            isEnabled: workflow.is_enabled ?? false,
          },
        })
        hasLoadedRef.current = true
      })
    }
  }, [isNew, workflow, workflowId, loadWorkflowWithEdges])

  // Sync state when workflow data changes (e.g., after refetch)
  useEffect(() => {
    if (workflow && !isNew) {
      queueMicrotask(() => {
        dispatch({
          type: 'INIT_WORKFLOW',
          payload: {
            name: workflow.name,
            description: workflow.description ?? workflow.name ?? 'New workflow',
            isEnabled: workflow.is_enabled ?? false,
          },
        })
      })
    }
  }, [workflow, isNew])

  const { mutate: createWorkflow, isPending: isCreating } = workflowClient.useMutation('post', '/workflows')
  const { mutate: updateWorkflow, isPending: isUpdating } = workflowClient.useMutation(
    'patch',
    '/workflows/{workflow_id}'
  )
  const { mutate: executeAutomation } = workflowClient.useMutation('post', '/executions')
  const { mutate: deleteWorkflow } = workflowClient.useMutation('delete', '/workflows/{workflow_id}')

  const isPending = isCreating || isUpdating

  // Get workflow definition for API submission (plain object - no serialization needed)
  const getWorkflowDefinition = useCallback((): WorkflowDefinition => {
    if (!currentWorkflow) {
      return {
        schemaVersion: '1.0.0',
        version: 1,
        metadata: {
          name: workflowName,
          description: workflowDescription,
        },
        workflow: { activities: [] },
      }
    }

    // Get edges from store to build nested condition structures
    const edges = useWorkflowStore.getState().edges

    // Validate save path before building (development only)
    // This ensures flat activities + edges can be successfully converted to nested structure
    validateSavePath(currentWorkflow.workflow.activities, edges)

    // Build nested condition structures from flat activities and edges
    // This converts the flat representation (used during editing) into the nested
    // structure expected by the API
    const nestedActivities = buildNestedConditionStructure(currentWorkflow.workflow.activities, edges)

    // Return workflow with updated metadata and nested activities
    // Note: We cast to WorkflowDefinition since the store's extended type includes
    // additional trigger types (ScheduledTrigger, EventTrigger) that are compatible
    // with the base API schema but not explicitly typed in the OpenAPI spec yet
    return {
      ...currentWorkflow,
      metadata: {
        ...currentWorkflow.metadata,
        name: workflowName,
        description: workflowDescription,
      },
      workflow: {
        ...currentWorkflow.workflow,
        activities: nestedActivities,
      },
    } as WorkflowDefinition
  }, [currentWorkflow, workflowName, workflowDescription])

  const handleSaveWorkflow = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      // Validate workflow before saving
      if (!currentWorkflow) {
        showError('No workflow to save', 'Validation Failed')
        resolve(false)
        return
      }

      const edges = useWorkflowStore.getState().edges

      // Validate the FLAT structure before nesting
      const validationResult = validateWorkflow(currentWorkflow.workflow.activities, edges)

      if (!validationResult.valid) {
        const errorMessages = validationResult.errors.map((error) => error.message).join('\n• ')
        showError(`Workflow validation failed:\n• ${errorMessages}`, 'Validation Failed')
        resolve(false)
        return
      }

      // Build the workflow definition (nesting loops, conditions, and parallels)
      const workflowDef = getWorkflowDefinition()
      const workflowData = {
        name: workflowName,
        description: workflowDescription,
        is_enabled: isEnabled,
        labels: workflow?.labels ?? {},
        workflow_definition: workflowDef,
      }

      const onSaveSuccess = async (successMessage: string, workflowIdToNavigate?: string) => {
        showSuccess(successMessage, 'Workflow Saved')
        // Mark workflow as clean (no unsaved changes)
        markClean()
        // Invalidate workflow queries to ensure fresh data on next load
        // IMPORTANT: await this to ensure cache is invalidated before navigation
        await queryClient.invalidateQueries({ predicate: isWorkflowQuery })

        // Navigate to edit route with the workflow ID (for new workflows)
        if (workflowIdToNavigate && isNew) {
          setLocation(`/automation-builder/${workflowIdToNavigate}`)
        }

        resolve(true)
      }

      const onSaveError = (error: unknown, action: string) => {
        const errorMessage =
          error && typeof error === 'object' && 'detail' in error ? String(error.detail) : 'Unknown error'
        showError(`Failed to ${action} workflow: ${errorMessage}`, `${action} Failed`)
        resolve(false)
      }

      if (workflowId && !isNew) {
        updateWorkflow(
          {
            params: { path: { workflow_id: workflowId } },
            body: workflowData as WorkflowInput,
          },
          {
            onSuccess: async () => {
              await onSaveSuccess('Workflow updated successfully', workflowId)
            },
            onError: (error) => onSaveError(error, 'update'),
          }
        )
      } else {
        createWorkflow(
          { body: workflowData as WorkflowInput },
          {
            onSuccess: async (data) => {
              await onSaveSuccess('Workflow created successfully', data.id)
            },
            onError: (error) => onSaveError(error, 'create'),
          }
        )
      }
    })
  }, [
    currentWorkflow,
    workflowName,
    workflowDescription,
    isEnabled,
    workflow?.labels,
    getWorkflowDefinition,
    workflowId,
    isNew,
    updateWorkflow,
    createWorkflow,
    showSuccess,
    showError,
    setLocation,
    queryClient,
    markClean,
  ])

  // Register save handler with the unsaved changes context
  useEffect(() => {
    registerSaveHandler(handleSaveWorkflow)
    return () => unregisterSaveHandler()
  }, [handleSaveWorkflow, registerSaveHandler, unregisterSaveHandler])

  const handleRunAutomation = useCallback(() => {
    if (!workflow?.id) return

    executeAutomation(
      { body: { workflow_id: workflow.id, input_data: {} } },
      {
        onSuccess: (data) => {
          showSuccess(`Successfully started automation "${workflowName}"`, 'Automation Started')
          dispatch({ type: 'SET_CONFIRM_DIALOG', payload: false })

          // Navigate to execution page with history panel open
          if (data && 'id' in data) {
            setLocation(`/executions/${data.id}?history=open`)
          }
        },
        onError: (error) => {
          showError(`Failed to start automation "${workflowName}": ${getErrorMessage(error)}`, 'Automation Failed')
          dispatch({ type: 'SET_CONFIRM_DIALOG', payload: false })
        },
      }
    )
  }, [workflow, workflowName, executeAutomation, showSuccess, showError, setLocation])

  const handleDeleteAutomation = useCallback(() => {
    if (!workflow?.id) return

    deleteWorkflow(
      { params: { path: { workflow_id: workflow.id } } },
      {
        onSuccess: () => {
          showSuccess(`Successfully deleted automation "${workflowName}"`, 'Automation Deleted')
          dispatch({ type: 'SET_DELETE_DIALOG', payload: false })
          // Navigate to new workflow page to start fresh
          setLocation('/automation-builder/new')
        },
        onError: (error) => {
          showError(`Failed to delete automation "${workflowName}": ${getErrorMessage(error)}`, 'Delete Failed')
          dispatch({ type: 'SET_DELETE_DIALOG', payload: false })
        },
      }
    )
  }, [workflow, workflowName, deleteWorkflow, showSuccess, showError, setLocation])

  const handleToggleDetails = useCallback(() => {
    dispatch({ type: 'TOGGLE_DETAILS' })
    if (!detailsOpen) {
      // When opening details, deselect all nodes in React Flow
      reactFlowInstance.setNodes((nodes) => nodes.map((node) => ({ ...node, selected: false })))
    }
  }, [reactFlowInstance, detailsOpen])

  const handleToggleHistory = useCallback(() => {
    dispatch({ type: 'TOGGLE_HISTORY' })
    if (!historyCardOpen) {
      void executionsQuery.refetch()
    }
  }, [historyCardOpen, executionsQuery])

  // v8 ignore start - React Flow callbacks (E2E tested)
  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node<NodeType['data']>) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isGeneric = (node.data as any).metadata?.__isGeneric === true
    dispatch({ type: 'NODE_CLICK', payload: { node, isGeneric } })
  }, [])

  const handleAddNodeFromEdge = useCallback(
    (sourceId: string, targetId?: string, edgeId?: string, handle?: string) => {
      let edgeTargetHandle: string | undefined = undefined
      if (edgeId && reactFlowInstance) {
        const edge = reactFlowInstance.getEdge(edgeId)
        edgeTargetHandle = edge?.targetHandle ?? undefined
      }
      dispatch({
        type: 'OPEN_ADD_NODE_FROM_EDGE',
        payload: { sourceId, targetId, edgeId, handle, targetHandle: edgeTargetHandle },
      })
    },
    [reactFlowInstance]
  )

  const handleConnectFromPanel = useCallback(
    (sourceId: string, targetId: string) => {
      const capturedEdgeIdToReplace = edgeIdToReplace
      const capturedTargetNodeId = targetNodeId
      const capturedSourceHandle = sourceHandle
      const capturedTargetHandle = targetHandle
      let attempts = 0
      const checkAndConnect = () => {
        const nodes = reactFlowInstance.getNodes()
        const targetNode = nodes.find((n) => n.id === targetId)
        if (targetNode?.measured) {
          const newEdge = EdgeFactory.createEdge({
            source: sourceId,
            target: targetId,
            sourceHandle: capturedSourceHandle,
            targetHandle: 'target',
            onAddNode: handleAddNodeFromEdge,
          })
          reactFlowInstance.setEdges((eds) => {
            const filtered = EdgeFactory.removeButtonEdge(sourceId, eds as EdgeType[], capturedSourceHandle)
            const withoutOldEdge = capturedEdgeIdToReplace
              ? filtered.filter((e) => e.id !== capturedEdgeIdToReplace)
              : filtered
            return EdgeFactory.addEdge(newEdge, withoutOldEdge)
          })
          if (capturedEdgeIdToReplace && capturedTargetNodeId) {
            const secondEdge = EdgeFactory.createEdge({
              source: targetId,
              target: capturedTargetNodeId,
              sourceHandle: 'source',
              targetHandle: capturedTargetHandle || 'target',
              onAddNode: handleAddNodeFromEdge,
            })
            reactFlowInstance.setEdges((eds) => EdgeFactory.addEdge(secondEdge, eds as EdgeType[]))
            useWorkflowStore.getState().moveActivityBefore(targetId, capturedTargetNodeId)
          }
          if (capturedSourceHandle === 'loop' && !capturedEdgeIdToReplace) {
            const loopBackEdge = EdgeFactory.createEdge({
              source: targetId,
              target: sourceId,
              sourceHandle: 'source',
              targetHandle: 'end',
              onAddNode: handleAddNodeFromEdge,
            })
            reactFlowInstance.setEdges((eds) => EdgeFactory.addEdge(loopBackEdge, eds as EdgeType[]))
          }
          const isConditionHandle = capturedSourceHandle && ['true', 'false'].includes(capturedSourceHandle)
          const isLoopHandle = capturedSourceHandle && ['done', 'loop'].includes(capturedSourceHandle)
          const sourcePlaceholderId =
            isConditionHandle || isLoopHandle
              ? `placeholder-${sourceId}-${capturedSourceHandle}`
              : `placeholder-${sourceId}`
          reactFlowInstance.setNodes((nds) => {
            const filtered = nds.filter((n) => n.id !== sourcePlaceholderId)
            const sourceNode = filtered.find((n) => n.id === sourceId)
            if (!sourceNode) return filtered
            if (sourceNode.type === FlowNodeType.CONDITION && hasConditionNodePlaceholders(filtered, sourceId))
              return filtered
            if (sourceNode.type === FlowNodeType.LOOP && hasLoopNodePlaceholders(filtered, sourceId)) return filtered
            return removeButtonEdgeClass(filtered, sourceId)
          })
        } else if (attempts++ < 40) {
          setTimeout(checkAndConnect, 50)
        }
      }
      checkAndConnect()
    },
    [edgeIdToReplace, targetNodeId, sourceHandle, targetHandle, reactFlowInstance, handleAddNodeFromEdge]
  )

  const handleNodesDeleted = useCallback((deletedNodeIds: string[]) => {
    dispatch({ type: 'CLEAR_SELECTED_IF_DELETED', payload: deletedNodeIds })
  }, [])
  // v8 ignore stop

  // v8 ignore start - Browser events and React Flow state monitoring (E2E tested)
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (useWorkflowStore.getState().isDirty) {
        event.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  const [nodeCount, setNodeCount] = useState(0)

  useEffect(() => {
    if (nodesInitialized) {
      const nodes = reactFlowInstance.getNodes()
      if (nodes.length !== nodeCount) setNodeCount(nodes.length)
    }
  }, [nodesInitialized, reactFlowInstance, nodeCount])
  // v8 ignore stop

  return (
    <NodeExpandedAllContext.Provider value={{ expandAllEvent, collapseAllEvent }}>
      <AppPage>
        <Stack hasGutter>
          <StackItem>
            <AppPageHeader
              title={
                <Flex gap={{ default: 'gapMd' }} alignItems={{ default: 'alignItemsCenter' }}>
                  <FlexItem>
                    <TextInput
                      id="workflow-name-input"
                      type="text"
                      value={workflowName}
                      onChange={(_event, value) => {
                        dispatch({ type: 'SET_WORKFLOW_NAME', payload: value })
                        markDirty()
                      }}
                      placeholder="Workflow name"
                    />
                  </FlexItem>
                </Flex>
              }
            >
              {/* Builder action buttons */}
              <>
                <Button
                  variant="plain"
                  onClick={() => {
                    dispatch({
                      type: 'OPEN_ADD_NODE_PANEL',
                      payload: { sourceNodeId: null, replacementNodeId: null },
                    })
                  }}
                  icon={
                    <Icon isInline>
                      <RhUiAddSquareIcon />
                    </Icon>
                  }
                  iconPosition="start"
                >
                  Add Node
                </Button>

                {!isNew && workflow?.id && (
                  <>
                    <Divider orientation={{ default: 'vertical' }} />
                    <Button
                      variant="plain"
                      onClick={() => dispatch({ type: 'SET_CONFIRM_DIALOG', payload: true })}
                      icon={
                        <Icon isInline>
                          <RhUiPlayIcon />
                        </Icon>
                      }
                      iconPosition="start"
                    >
                      Run
                    </Button>
                  </>
                )}

                <Divider orientation={{ default: 'vertical' }} />

                <Tooltip content="Workflow details">
                  <Button
                    variant="plain"
                    onClick={handleToggleDetails}
                    icon={
                      <Icon isInline>
                        <RhUiCodeIcon />
                      </Icon>
                    }
                    aria-label="Workflow details"
                  />
                </Tooltip>

                {!isNew && workflow?.id && (
                  <Tooltip content="Run history">
                    <Button
                      variant="plain"
                      onClick={handleToggleHistory}
                      icon={
                        <Icon isInline>
                          <RhUiHistoryIcon />
                        </Icon>
                      }
                      aria-label="Run history"
                    />
                  </Tooltip>
                )}

                <Divider orientation={{ default: 'vertical' }} />

                <Button
                  variant="plain"
                  onClick={handleSaveWorkflow}
                  isDisabled={isPending}
                  icon={
                    <Icon isInline>
                      <RhUiSaveFillIcon />
                    </Icon>
                  }
                  iconPosition="start"
                >
                  {isPending ? 'Saving...' : 'Save'}
                </Button>

                {!isNew && (
                  <>
                    <Divider orientation={{ default: 'vertical' }} />
                    <Switch
                      isChecked={isEnabled}
                      onChange={(_event, checked) => {
                        dispatch({ type: 'SET_IS_ENABLED', payload: checked })
                        markDirty()
                      }}
                      label={isEnabled ? 'Enabled' : 'Disabled'}
                    />
                  </>
                )}

                {!isNew && workflow?.id && (
                  <>
                    <Divider orientation={{ default: 'vertical' }} />
                    <Dropdown
                      isOpen={isKebabOpen}
                      onOpenChange={(isOpen) => dispatch({ type: 'SET_KEBAB_OPEN', payload: isOpen })}
                      popperProps={{ position: 'right' }}
                      toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                        <MenuToggle
                          ref={toggleRef}
                          variant="plain"
                          onClick={() => dispatch({ type: 'SET_KEBAB_OPEN', payload: !isKebabOpen })}
                          isExpanded={isKebabOpen}
                          aria-label="Automation actions"
                        >
                          <RhUiEllipsisVerticalFillIcon />
                        </MenuToggle>
                      )}
                    >
                      <DropdownList>
                        <DropdownItem
                          onClick={() => {
                            dispatch({ type: 'SET_DELETE_DIALOG', payload: true })
                            dispatch({ type: 'SET_KEBAB_OPEN', payload: false })
                          }}
                          isDanger
                        >
                          <Icon isInline style={{ marginRight: 'var(--pf-t--global--spacer--sm)' }}>
                            <RhUiTrashIcon />
                          </Icon>
                          Delete automation
                        </DropdownItem>
                      </DropdownList>
                    </Dropdown>
                  </>
                )}
              </>
            </AppPageHeader>
          </StackItem>
          <StackItem
            isFilled
            style={{
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            <Flex
              alignItems={{ default: 'alignItemsStretch' }}
              flexWrap={{ default: 'nowrap' }}
              gap={{ default: 'gapSm' }}
              style={{
                position: 'relative',
                minWidth: 0,
                height: '100%',
                overflow: 'hidden',
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
                  overflow: 'hidden',
                  pointerEvents: isNodeEditorOpen ? 'none' : 'auto',
                }}
              >
                <Stack style={{ height: '100%', overflow: 'hidden', gap: 'var(--pf-t--global--spacer--sm)' }}>
                  <StackItem
                    isFilled
                    style={{
                      minHeight: 0,
                      overflow: 'hidden',
                    }}
                  >
                    <CompassPanel
                      hasNoPadding
                      style={{
                        position: 'relative',
                        minWidth: 0,
                        width: '100%',
                        height: '100%',
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
                      />
                    </CompassPanel>
                  </StackItem>
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
                  <AutomationHistoryCard
                    executions={executionsQuery.data?.resources ?? []}
                    onClose={() => dispatch({ type: 'SET_HISTORY_CARD_OPEN', payload: false })}
                    onExecutionSelect={(executionId) => {
                      setLocation(`/executions/${executionId}`)
                    }}
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
                onConnect={handleConnectFromPanel}
                onClose={() => dispatch({ type: 'CLOSE_NODE_EDITOR' })}
              />
            </Flex>
          </StackItem>
        </Stack>

        <Modal
          isOpen={confirmDialogOpen}
          onClose={() => dispatch({ type: 'SET_CONFIRM_DIALOG', payload: false })}
          variant="small"
          aria-labelledby="run-workflow-modal-title"
          aria-describedby="run-workflow-modal-description"
        >
          <ModalHeader title={`Run ${workflowName}?`} labelId="run-workflow-modal-title" />
          <ModalBody id="run-workflow-modal-description">
            You are about to manually run this automation. This action will start the automation immediately, bypassing
            its normal trigger conditions.
          </ModalBody>
          <ModalFooter>
            <Button variant="link" onClick={() => dispatch({ type: 'SET_CONFIRM_DIALOG', payload: false })}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleRunAutomation}>
              Run now
            </Button>
          </ModalFooter>
        </Modal>
        <Modal
          isOpen={deleteDialogOpen}
          onClose={() => dispatch({ type: 'SET_DELETE_DIALOG', payload: false })}
          variant="medium"
          aria-labelledby="delete-automation-modal-title"
          aria-describedby="delete-automation-modal-body"
        >
          <ModalHeader title="Delete automation?" titleIconVariant="warning" labelId="delete-automation-modal-title" />
          <ModalBody id="delete-automation-modal-body">
            <Stack hasGutter>
              <StackItem>
                You are about to permanently delete this automation. This action cannot be reversed. After deletion, the
                following will occur:
              </StackItem>
              <StackItem>
                <List>
                  <ListItem>This automation will stop running immediately.</ListItem>
                  <ListItem>
                    Any other automations that use this one as a step will also become invalid and stop running.
                  </ListItem>
                </List>
              </StackItem>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button
              key="cancel"
              variant="secondary"
              onClick={() => dispatch({ type: 'SET_DELETE_DIALOG', payload: false })}
            >
              Cancel
            </Button>
            <Button key="delete" variant="danger" onClick={handleDeleteAutomation}>
              Delete
            </Button>
          </ModalFooter>
        </Modal>
      </AppPage>
    </NodeExpandedAllContext.Provider>
  )
}
