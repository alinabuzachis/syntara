import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { CompassPanel } from '@patternfly/react-core'
import { ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useEffect, useRef } from 'react'

import { useWorkflowStoreActions } from '../../stores/useWorkflowStore'
import { useExecutionStoreActions } from '../automations/stores/useExecutionStore'

import { BuilderFlow } from './BuilderFlow'
import { ExecutionViewContext } from './ExecutionViewContext'
import { loadWorkflow } from './utils/loadWorkflow'

type Workflow = WorkflowAPI.components['schemas']['Workflow']
type ActivityExecution = WorkflowAPI.components['schemas']['ActivityExecution']

interface ExecutionViewContentProps {
  workflow?: Workflow
  executionStatus?: string | null
  executionActivities?: ActivityExecution[]
  executionId: string
}

/**
 * Inner component that has access to React Flow instance
 * Handles workflow loading and execution state synchronization
 */
function ExecutionViewContentInner(props: ExecutionViewContentProps) {
  const { workflow, executionStatus, executionActivities, executionId } = props
  const { loadWorkflowWithEdges, setWorkflow: setWorkflowInStore, setEdges: setStoredEdges } = useWorkflowStoreActions()
  const { setActivityExecutions } = useExecutionStoreActions()
  const hasLoadedRef = useRef(false)
  const hasLoadedActivitiesRef = useRef(false)
  const prevWorkflowIdRef = useRef<string | null>(null)
  const prevExecutionIdRef = useRef<string | null>(null)

  // Load execution activities into execution store FIRST (before workflow)
  useEffect(() => {
    const workflowId = workflow?.id ?? null

    // Reset when workflow OR execution changes
    if (prevWorkflowIdRef.current !== workflowId || prevExecutionIdRef.current !== executionId) {
      hasLoadedActivitiesRef.current = false
      prevExecutionIdRef.current = executionId
    }

    // Load execution activities before workflow
    if (executionActivities && executionActivities.length > 0 && !hasLoadedActivitiesRef.current) {
      setActivityExecutions(executionActivities)
      hasLoadedActivitiesRef.current = true
    }
  }, [executionActivities, setActivityExecutions, workflow, executionId])

  // Load workflow into store AFTER activities are loaded
  useEffect(() => {
    const workflowId = workflow?.id ?? null

    // Reset when workflow ID OR execution ID changes
    if (prevWorkflowIdRef.current !== workflowId || prevExecutionIdRef.current !== executionId) {
      setWorkflowInStore(null)
      setStoredEdges([])
      hasLoadedRef.current = false
      prevWorkflowIdRef.current = workflowId
      prevExecutionIdRef.current = executionId
    }

    // Only load workflow if we have activities loaded (or no activities to load)
    const canLoadWorkflow = !executionActivities || executionActivities.length === 0 || hasLoadedActivitiesRef.current

    // Load the workflow if we have one and haven't loaded it yet
    if (workflow && !hasLoadedRef.current && canLoadWorkflow) {
      // Extract workflow definition - handle both direct workflow and version.workflow_definition structures
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const workflowDef = (workflow as any).version?.workflow_definition || workflow

      // Safety check - ensure we have the workflow structure
      if (!workflowDef?.workflow?.activities) {
        // eslint-disable-next-line no-console
        console.warn('ExecutionViewContent: Invalid workflow structure', workflow)
        return
      }

      // Use loadWorkflow to flatten and generate edges
      const { activities: flattenedActivities, edges: generatedEdges } = loadWorkflow(workflowDef.workflow.activities)

      // Generate trigger edges (triggers connect to first activities)
      const triggers = workflowDef.triggers || []
      const firstActivityId = flattenedActivities[0]?.id
      const triggerEdges =
        firstActivityId && triggers.length > 0
          ? triggers.map((_: unknown, index: number) => ({
              id: `trigger-${index}-edge`,
              source: `trigger-${index}`,
              target: firstActivityId,
            }))
          : []

      const allEdges = [...triggerEdges, ...generatedEdges]

      // Create flattened workflow with activities in execution order
      const flattenedWorkflow = {
        ...workflowDef,
        workflow: {
          ...workflowDef.workflow,
          activities: flattenedActivities,
        },
      }

      // Load workflow and edges into store
      queueMicrotask(() => {
        loadWorkflowWithEdges(flattenedWorkflow, allEdges)
        hasLoadedRef.current = true
      })
    }
  }, [workflow, loadWorkflowWithEdges, setWorkflowInStore, setStoredEdges, executionActivities, executionId])

  return (
    <CompassPanel
      hasNoPadding
      isFullHeight
      style={{
        position: 'relative',
        minWidth: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <BuilderFlow
        workflowId={workflow?.id ?? null}
        panelOpen={false}
        activeEdgeButtonNodeId={null}
        activeEdgeButtonHandle={null}
        activeEdgeId={null}
        executionStatus={executionStatus}
        onNodeClick={() => {
          // No-op: nodes are not clickable in execution view
        }}
        onAddNodeFromEdge={() => {
          // No-op: cannot add nodes in execution view
        }}
        onNodesDeleted={() => {
          // No-op: cannot delete nodes in execution view
        }}
      />
    </CompassPanel>
  )
}

/**
 * Read-only execution view component
 * Renders workflow execution visualization without any editing features
 *
 * Key differences from BuilderContent:
 * - No AddNodePanel
 * - No NodeDetailsPanel
 * - No WorkflowSidepanel
 * - No save/run buttons
 * - No node click handlers
 * - No edge button creation
 */
export function ExecutionViewContent(props: ExecutionViewContentProps) {
  return (
    <ExecutionViewContext.Provider value={true}>
      <ReactFlowProvider>
        <ExecutionViewContentInner {...props} />
      </ReactFlowProvider>
    </ExecutionViewContext.Provider>
  )
}
