/* eslint-disable max-lines */
import type { Activity, WorkflowAPI } from '@ansible/nexus-contracts'
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
  Label,
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
import { executionsClient, workflowClient } from '../../client'
import { useAlerts } from '../../components/alerts'
import { getActivityMetadata, useWorkflowStore } from '../../stores/useWorkflowStore'
import type { FilterConfig } from '../../types/filters'
import { getErrorMessage } from '../../utils/apiErrors'
import { buildFilterParams } from '../../utils/filterUtils'
import { buildTriggerNodeId } from '../../utils/triggerNodeIds'
import { NodeExpandedAllContext } from '../automations/canvas/nodes/common/NodeExpandedAllContext'
import type { NodeType } from '../automations/canvas/nodes/NodeType'

import { AddNodePanel } from './AddNodePanel'
import { AutomationHistoryCard } from './AutomationHistoryCard'
import { BuilderFlow } from './BuilderFlow'
import { builderReducer, getInitialBuilderState } from './builderReducer'
import { NodeEditorOverlay } from './components/NodeEditorOverlay'
import { EditAutomationDetailsPopover } from './EditAutomationDetailsPopover'
import { ExecutionDetailsPanel } from './ExecutionDetailsPanel'
import { ExecutionViewContent } from './ExecutionViewContent'
import { formatHistoryDateTime } from './historyDateUtils'
import { NodeActionsContext, type NodeActionsContextValue } from './NodeActionsContext'
import { RunHistoryToggleButton } from './RunHistoryToggleButton'
import type { FlowPosition } from './types'
import type { EdgeConnection } from './types/edge'
// buildNestedConditionStructure removed — v2 uses flat nodes + edges
import { calculateEdgeConnection, applyEdgeConnection } from './utils/edgeConnectionHelpers'
import { v2PortToHandle } from './utils/edgeHelpers'
// loadWorkflow and validateRoundTrip removed — v2 activities are already flat
import { validateWorkflow } from './utils/validation'
import { buildWorkflowDefinition } from './utils/workflowDefinitionBuilder'
import { WORKFLOWS_LIST_PARAMS_FOR_DEFAULT_NAME } from './utils/workflowListQuery'
import { DEFAULT_WORKFLOW_NAME, getNextDefaultWorkflowName } from './utils/workflowNaming'
import { WorkflowSidepanel } from './WorkflowSidepanel'

// Type aliases from API contracts
type WorkflowWithVersion = WorkflowAPI.components['schemas']['WorkflowWithVersion']
type WorkflowInput = WorkflowAPI.paths['/workflows']['post']['requestBody']['content']['application/json']
type WorkflowDefinition = import('../../stores/workflowStoreTypes').WorkflowDefinition

interface BuilderContentProps {
  workflow?: WorkflowWithVersion
  isNew: boolean
  workflowId: string | null
}

// v8 ignore start - Helper functions only called from React Flow callbacks (E2E tested)

const DUPLICATE_GAP = 120
const DUPLICATE_COLLISION_PADDING = 20
const DEFAULT_NODE_WIDTH = 300
const DEFAULT_NODE_HEIGHT = 60

/**
 * Returns the top-left position where a duplicated node can be placed without
 * overlapping any existing node.
 *
 * Strategy:
 * 1. Scan rightward from preferredX across up to 10 rows, skipping over any
 *    blocking node's right edge on each row.
 * 2. If every row is fully blocked (extremely unlikely), fall back to a position
 *    beyond the rightmost edge of all nodes — which is mathematically guaranteed
 *    to be free because no existing node's right edge can reach that x coordinate.
 */
function findDuplicatePosition(originalNode: Node, allNodes: Node[]): FlowPosition {
  const origWidth = originalNode.measured?.width ?? DEFAULT_NODE_WIDTH
  const origHeight = originalNode.measured?.height ?? DEFAULT_NODE_HEIGHT
  const measuredNodes = allNodes.filter((n) => n.id !== originalNode.id && n.measured != null)

  function getBlocker(x: number, y: number): Node | null {
    return (
      measuredNodes.find((node) => {
        const nw = node.measured?.width ?? DEFAULT_NODE_WIDTH
        const nh = node.measured?.height ?? DEFAULT_NODE_HEIGHT
        const p = DUPLICATE_COLLISION_PADDING
        return !(
          x + origWidth + p <= node.position.x ||
          node.position.x + nw + p <= x ||
          y + origHeight + p <= node.position.y ||
          node.position.y + nh + p <= y
        )
      }) ?? null
    )
  }

  /** Scan rightward from `startX` at a fixed `y`, skipping over blockers. */
  function scanForSlot(startX: number, y: number): FlowPosition | null {
    let x = startX
    for (let attempt = 0; attempt < 20; attempt++) {
      const blocker = getBlocker(x, y)
      if (!blocker) return { x, y }
      x = blocker.position.x + (blocker.measured?.width ?? DEFAULT_NODE_WIDTH) + DUPLICATE_GAP
    }
    return null
  }

  const preferredX = originalNode.position.x + origWidth + DUPLICATE_GAP

  for (let row = 0; row < 10; row++) {
    const y = originalNode.position.y + row * (origHeight + DUPLICATE_GAP)
    const slot = scanForSlot(preferredX, y)
    if (slot) return slot
  }

  // Guaranteed-free fallback: place beyond the rightmost edge of every node on
  // the canvas. For any node n: n.right + DUPLICATE_GAP <= rightmostX, so
  // n.right + DUPLICATE_COLLISION_PADDING < rightmostX — no node can
  // horizontally overlap a candidate whose left edge starts at rightmostX.
  const rightmostX = measuredNodes.reduce(
    (max, n) => Math.max(max, n.position.x + (n.measured?.width ?? DEFAULT_NODE_WIDTH) + DUPLICATE_GAP),
    preferredX
  )
  return { x: rightmostX, y: originalNode.position.y }
}

function isWorkflowQuery(query: Query): boolean {
  return (
    query.queryKey[0] === 'get' && typeof query.queryKey[1] === 'string' && query.queryKey[1].startsWith('/workflows')
  )
}
// v8 ignore stop
// eslint-disable-next-line max-lines-per-function, complexity
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
  const executionsQueryParams = useMemo(() => {
    const params: Record<string, unknown> = { workflow_id: workflowId ?? '' }
    Object.assign(params, buildFilterParams(executionFilters))
    return params
  }, [workflowId, executionFilters])

  const executionsQuery = executionsClient.useQuery(
    'get',
    '/executions',
    {
      params: { query: executionsQueryParams },
    },
    {
      enabled: !!workflowId && !isNew,
      staleTime: 30000, // Consider fresh for 30 seconds
      gcTime: 300000, // Keep in cache for 5 minutes
    }
  )

  // Fetch execution details for the selected run (canvas + details panel)
  const selectedExecutionQuery = executionsClient.useQuery(
    'get',
    '/executions/{execution_id}',
    {
      params: {
        path: { execution_id: selectedExecutionId ?? '' },
        query: { include: 'activities' },
      },
    },
    { enabled: !!selectedExecutionId && historyCardOpen }
  )

  // Fetch workflows whose name starts with DEFAULT_WORKFLOW_NAME so we can pick the next available default name.
  const workflowsListQuery = workflowClient.useQuery('get', '/workflows', WORKFLOWS_LIST_PARAMS_FOR_DEFAULT_NAME, {
    enabled: isNew,
  })

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

  const hasInitedNewWorkflowRef = useRef(false)
  useEffect(() => {
    if (isNew) {
      if (hasInitedNewWorkflowRef.current) return
      hasInitedNewWorkflowRef.current = true
      const resources = workflowsListQuery.data?.resources ?? []
      const defaultName = getNextDefaultWorkflowName(resources)
      const newWorkflow: WorkflowDefinition = {
        schema_version: '2.0.0',
        name: defaultName,
        description: 'New workflow',
        workflow: {
          activities: [],
        },
      }
      queueMicrotask(() => {
        // Use atomic operation for consistency
        loadWorkflowWithEdges(newWorkflow, [])
        dispatch({
          type: 'INIT_WORKFLOW',
          payload: { name: defaultName, description: 'New workflow', tags: [], isEnabled: false },
        })
        // No need for markClean - loadWorkflowWithEdges sets isDirty: false
      })
    } else if (workflow?.version?.workflow_definition && !hasLoadedRef.current && workflow.id === workflowId) {
      // Load existing workflow - ONLY on first load, not during refetch after save
      // This prevents overwriting user-created edges (including ButtonEdges) with saved edges
      // CRITICAL: Only load if workflow.id matches workflowId (prevents loading stale cached workflow)
      const workflowDef = workflow.version.workflow_definition

      // V2: activities are at workflowDef.nodes, edges at workflowDef.edges
      const nodes = (workflowDef.nodes ?? []) as Activity[]
      const v2Edges = (workflowDef.edges ?? []) as Array<{
        from: string
        to: string
        from_port?: string
        to_port?: string
      }>
      // SECURITY: Ensure all triggers have IDs at load time.
      // If any trigger loaded from the API lacks an ID, generate one from its type and index.
      // This prevents display IDs (trigger-0) from leaking to the backend at save time.
      const triggers = (workflowDef.triggers ?? []).map((t, index) => {
        const trigger = t as { id?: string; type?: string }
        if (!trigger.id) {
          return { ...t, id: `${trigger.type ?? 'trigger'}_${index}` }
        }
        return t
      })

      // Activities are already flat in v2 - sanitize metadata on the write path
      // SECURITY: Sanitize metadata when loading from API to enforce allowlist
      const flattenedActivities = nodes.map((a) => {
        const meta = getActivityMetadata(a)
        // SECURITY: If meta is defined, replace with sanitized version.
        // If meta is undefined, strip any raw metadata from the API to prevent
        // unsanitized properties from reaching the UI.
        if (meta) return { ...a, metadata: meta }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructuring to strip metadata
        const { metadata: _unsanitized, ...rest } = a as Activity & { metadata?: unknown }
        return rest as Activity
      })

      // Build map: trigger definition ID → React Flow display ID
      // e.g. "manual_trigger" → "trigger-0"
      const triggerIdToDisplayId = new Map<string, string>()
      triggers.forEach((t, index) => {
        const defId = (t as { id?: string }).id
        if (defId) {
          triggerIdToDisplayId.set(defId, buildTriggerNodeId(index))
        }
      })

      // Build set of valid node IDs (activities + triggers)
      const validNodeIds = new Set<string>()
      flattenedActivities.forEach((a) => validNodeIds.add(a.id))
      triggers.forEach((_, index) => validNodeIds.add(buildTriggerNodeId(index)))

      // Convert v2 edges to React Flow edges, mapping trigger IDs to display IDs
      // Filter out orphaned edges (edges referencing non-existent nodes)
      const generatedEdges: EdgeConnection[] = v2Edges
        .map((e) => {
          const source = triggerIdToDisplayId.get(e.from) ?? e.from
          const target = triggerIdToDisplayId.get(e.to) ?? e.to
          const portSuffix = e.from_port ? `-${e.from_port}` : ''
          return {
            id: `${source}-${target}${portSuffix}`,
            source,
            target,
            sourceHandle: v2PortToHandle(e.from_port),
            targetHandle: e.to_port ? v2PortToHandle(e.to_port) : 'target',
          }
        })
        .filter((edge) => {
          // Filter out edges that reference non-existent nodes
          const sourceExists = validNodeIds.has(edge.source)
          const targetExists = validNodeIds.has(edge.target)
          const isValid = sourceExists && targetExists

          if (!isValid) {
            // eslint-disable-next-line no-console
            console.warn(`Filtered orphaned edge: ${edge.id} (${edge.source} -> ${edge.target})`, {
              sourceExists,
              targetExists,
            })
          }

          return isValid
        })

      // Build internal store representation with workflow.activities wrapper
      const flattenedWorkflow = {
        ...workflowDef,
        workflow: {
          activities: flattenedActivities,
        },
      } as unknown as WorkflowDefinition

      queueMicrotask(() => {
        // Use atomic operation to set both workflow and edges together
        // This prevents race conditions where BuilderFlow renders with workflow but no edges
        // Note: loadWorkflowWithEdges already sets isDirty to false
        loadWorkflowWithEdges(flattenedWorkflow, generatedEdges)
        // Tags come only from workflow.labels (list API returns them)
        const tagKeys = Object.keys(workflow.labels ?? {})
        dispatch({
          type: 'INIT_WORKFLOW',
          payload: {
            name: workflow.name,
            description: workflow.description ?? workflow.name ?? DEFAULT_WORKFLOW_NAME,
            tags: tagKeys,
            isEnabled: workflow.is_enabled ?? false,
          },
        })
        hasLoadedRef.current = true
      })
    }
  }, [isNew, workflow, workflowId, loadWorkflowWithEdges, workflowsListQuery.data])

  // Sync state when workflow data changes (e.g., after refetch)
  useEffect(() => {
    if (workflow && !isNew) {
      queueMicrotask(() => {
        const tagKeys = Object.keys(workflow.labels ?? {})
        dispatch({
          type: 'INIT_WORKFLOW',
          payload: {
            name: workflow.name,
            description: workflow.description ?? workflow.name ?? DEFAULT_WORKFLOW_NAME,
            tags: tagKeys,
            isEnabled: workflow.is_enabled ?? false,
          },
        })
      })
    }
  }, [workflow, isNew])

  // When creating a new workflow, set default name to next available (new-workflow, new-workflow-1, ...)
  const hasAppliedDefaultNameRef = useRef(false)
  useEffect(() => {
    if (!isNew) return
    const resources = workflowsListQuery.data?.resources
    if (resources === undefined) return
    if (workflowName !== DEFAULT_WORKFLOW_NAME) return
    if (hasAppliedDefaultNameRef.current) return
    const nextName = getNextDefaultWorkflowName(resources)
    if (nextName === DEFAULT_WORKFLOW_NAME) return
    hasAppliedDefaultNameRef.current = true
    dispatch({ type: 'SET_WORKFLOW_NAME', payload: nextName })
  }, [isNew, workflowsListQuery.data, workflowName])

  // Ensure workflows list is fetched when on new workflow page (in case cache was empty)
  const hasRefetchedWorkflowsOnceRef = useRef(false)
  const workflowsListRefetch = (workflowsListQuery as { refetch?: () => void }).refetch
  useEffect(() => {
    if (!isNew) return
    if (workflowsListQuery.data !== undefined) return
    if (workflowsListQuery.isPending) return
    if (workflowsListQuery.error) return
    if (hasRefetchedWorkflowsOnceRef.current) return
    hasRefetchedWorkflowsOnceRef.current = true
    if (workflowsListRefetch) void workflowsListRefetch()
  }, [isNew, workflowsListQuery.data, workflowsListQuery.isPending, workflowsListQuery.error, workflowsListRefetch])

  const { mutate: createWorkflow, isPending: isCreating } = workflowClient.useMutation('post', '/workflows')
  const { mutate: updateWorkflow, isPending: isUpdating } = workflowClient.useMutation(
    'patch',
    '/workflows/{workflow_id}'
  )
  const { mutate: executeAutomation } = executionsClient.useMutation('post', '/executions')
  const { mutate: deleteWorkflow } = workflowClient.useMutation('delete', '/workflows/{workflow_id}')

  const isPending = isCreating || isUpdating

  // Get workflow definition for API submission (plain object - no serialization needed)
  const getWorkflowDefinition = useCallback(() => {
    const edges = useWorkflowStore.getState().edges
    const activities = currentWorkflow?.workflow.activities ?? []
    const triggers = currentWorkflow?.triggers ?? []

    return buildWorkflowDefinition(workflowName, workflowDescription, activities, triggers, edges)
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

      // Build the v2 workflow definition (flat triggers, nodes, edges)
      // Resolve default name at save time so we never POST a duplicate
      let nameToSave = workflowName
      if (isNew && workflowName === DEFAULT_WORKFLOW_NAME && workflowsListQuery.data?.resources) {
        nameToSave = getNextDefaultWorkflowName(workflowsListQuery.data.resources)
      }
      const workflowDef = getWorkflowDefinition()
      workflowDef.name = nameToSave
      // Tags are persisted as workflow.labels (key = tag name, value = '') so they appear in list API.
      const workflowData = {
        name: nameToSave,
        description: workflowDescription,
        is_enabled: isEnabled,
        labels: Object.fromEntries(workflowTags.map((t) => [t, ''])),
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
            body: workflowData as unknown as WorkflowInput,
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
          { body: workflowData as unknown as WorkflowInput },
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
    workflowTags,
    isEnabled,
    getWorkflowDefinition,
    workflowId,
    isNew,
    workflowsListQuery.data,
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

  // Auto-select the first execution when the history panel opens and data is available
  const executions = useMemo(() => executionsQuery.data?.resources ?? [], [executionsQuery.data?.resources])
  useEffect(() => {
    if (historyCardOpen && !selectedExecutionId && executions.length > 0) {
      dispatch({ type: 'SET_SELECTED_EXECUTION_ID', payload: executions[0].id })
    }
  }, [historyCardOpen, selectedExecutionId, executions])

  // Build execution workflow for the canvas view when a run is selected
  const selectedExecution = selectedExecutionQuery.data
  const executionWorkflow = useMemo(() => {
    if (!selectedExecution?.workflow_definition || !selectedExecution.workflow_id) return undefined
    const wfDef = selectedExecution.workflow_definition as { metadata?: { name?: string } }
    return {
      id: selectedExecution.workflow_id,
      name: wfDef.metadata?.name ?? 'Workflow',
      version: { workflow_definition: selectedExecution.workflow_definition },
    }
  }, [selectedExecution])

  const executionActivities = useMemo(() => selectedExecution?.activities ?? [], [selectedExecution])

  const isViewingExecution = !!selectedExecutionId

  // v8 ignore start - React Flow callbacks (E2E tested)
  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node<NodeType['data']>) => {
    const isGeneric = getActivityMetadata(node.data)?.__isGeneric === true
    dispatch({ type: 'NODE_CLICK', payload: { node, isGeneric } })
  }, [])

  const handleClearDesiredPosition = useCallback(() => dispatch({ type: 'CLEAR_NEW_NODE_DESIRED_POSITION' }), [])

  const handleAddNodeFromEdge = useCallback(
    (sourceId: string, targetId?: string, edgeId?: string, handle?: string, desiredPosition?: FlowPosition) => {
      let edgeTargetHandle: string | undefined = undefined
      if (edgeId && reactFlowInstance) {
        const edge = reactFlowInstance.getEdge(edgeId)
        edgeTargetHandle = edge?.targetHandle ?? undefined
      }
      dispatch({
        type: 'OPEN_ADD_NODE_FROM_EDGE',
        payload: { sourceId, targetId, edgeId, handle, targetHandle: edgeTargetHandle, desiredPosition },
      })
    },
    [reactFlowInstance]
  )

  const handleConnectFromPanel = useCallback(
    (sourceId: string, targetId: string) => {
      const params = {
        sourceId,
        targetId,
        edgeIdToReplace,
        targetNodeId,
        sourceHandle,
        targetHandle,
        onAddNode: handleAddNodeFromEdge,
      }

      const result = calculateEdgeConnection(params, reactFlowInstance)

      applyEdgeConnection(result, params, targetId, reactFlowInstance, () => {
        if (result.activityReorderTarget) {
          useWorkflowStore.getState().moveActivityBefore(targetId, result.activityReorderTarget)
        }
      })
    },
    [edgeIdToReplace, targetNodeId, sourceHandle, targetHandle, reactFlowInstance, handleAddNodeFromEdge]
  )

  const handleNodesDeleted = useCallback((deletedNodeIds: string[]) => {
    dispatch({ type: 'CLEAR_SELECTED_IF_DELETED', payload: deletedNodeIds })
  }, [])

  const handleViewNodeDetails = useCallback(
    (nodeId: string) => {
      const node = reactFlowInstance.getNode(nodeId) as Node<NodeType['data']> | undefined
      if (!node) return
      const isGeneric = getActivityMetadata(node.data)?.__isGeneric === true
      dispatch({ type: 'NODE_CLICK', payload: { node, isGeneric } })
    },
    [reactFlowInstance]
  )

  const handleReplaceNode = useCallback((nodeId: string) => {
    dispatch({ type: 'OPEN_ADD_NODE_PANEL', payload: { sourceNodeId: null, replacementNodeId: nodeId } })
  }, [])

  const handleDuplicateNode = useCallback(
    (nodeId: string) => {
      const node = reactFlowInstance.getNode(nodeId)
      dispatch({ type: 'CLOSE_NODE_EDITOR' })
      if (node) {
        const allNodes = reactFlowInstance.getNodes()
        const { x, y } = findDuplicatePosition(node, allNodes)
        const nodeHeight = node.measured?.height ?? 60
        // useNodePositioning treats desiredPosition as (leftEdge.x, verticalCentre.y)
        dispatch({
          type: 'SET_NEW_NODE_DESIRED_POSITION',
          payload: { x, y: y + nodeHeight / 2 },
        })
      }
      duplicateActivity(nodeId)
    },
    [reactFlowInstance, duplicateActivity]
  )

  const nodeActionsValue = useMemo<NodeActionsContextValue>(
    () => ({ onViewDetails: handleViewNodeDetails, onReplace: handleReplaceNode, onDuplicate: handleDuplicateNode }),
    [handleViewNodeDetails, handleReplaceNode, handleDuplicateNode]
  )
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (nodes.length !== nodeCount) setNodeCount(nodes.length)
    }
  }, [nodesInitialized, reactFlowInstance, nodeCount])
  // v8 ignore stop

  return (
    <NodeActionsContext.Provider value={nodeActionsValue}>
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
                    <FlexItem>
                      <EditAutomationDetailsPopover
                        name={workflowName}
                        description={workflowDescription}
                        tags={workflowTags}
                        onApply={(name, description, tags) => {
                          const nameChanged = name !== workflowName
                          const descriptionChanged = description !== workflowDescription
                          const tagsChanged =
                            tags.length !== workflowTags.length || tags.some((t, i) => t !== workflowTags[i])
                          if (nameChanged) dispatch({ type: 'SET_WORKFLOW_NAME', payload: name })
                          if (descriptionChanged) dispatch({ type: 'SET_WORKFLOW_DESCRIPTION', payload: description })
                          if (tagsChanged) dispatch({ type: 'SET_WORKFLOW_TAGS', payload: tags })
                          if (nameChanged || descriptionChanged || tagsChanged) markDirty()
                        }}
                      />
                    </FlexItem>
                    {isViewingExecution && selectedExecution?.created_at && (
                      <FlexItem>
                        <Label>{`Viewing run: ${formatHistoryDateTime(selectedExecution.created_at)}`}</Label>
                      </FlexItem>
                    )}
                  </Flex>
                }
              >
                {isViewingExecution ? (
                  <>
                    <RunHistoryToggleButton onClick={handleToggleHistory} isActive={historyCardOpen} />

                    <Button
                      variant="primary"
                      onClick={() => {
                        dispatch({ type: 'SET_SELECTED_EXECUTION_ID', payload: null })
                        dispatch({ type: 'SET_HISTORY_CARD_OPEN', payload: false })
                      }}
                    >
                      Back to editor
                    </Button>
                  </>
                ) : (
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
                      Add Step
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

                    {!isNew && workflow?.id && <RunHistoryToggleButton onClick={handleToggleHistory} />}

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
                )}
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
                      {isViewingExecution ? (
                        <ExecutionViewContent
                          workflow={executionWorkflow}
                          executionStatus={selectedExecution?.status ?? null}
                          executionActivities={executionActivities}
                          executionId={selectedExecutionId}
                        />
                      ) : (
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
                            newNodeDesiredPosition={state.newNodeDesiredPosition}
                            onClearDesiredPosition={handleClearDesiredPosition}
                          />
                        </CompassPanel>
                      )}
                    </StackItem>

                    {/* Execution details panel shown below canvas when viewing a run */}
                    {isViewingExecution && (
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
                    <AutomationHistoryCard
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
              You are about to manually run this automation. This action will start the automation immediately,
              bypassing its normal trigger conditions.
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
            <ModalHeader
              title="Delete automation?"
              titleIconVariant="warning"
              labelId="delete-automation-modal-title"
            />
            <ModalBody id="delete-automation-modal-body">
              <Stack hasGutter>
                <StackItem>
                  You are about to permanently delete this automation. This action cannot be reversed. After deletion,
                  the following will occur:
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
    </NodeActionsContext.Provider>
  )
}
