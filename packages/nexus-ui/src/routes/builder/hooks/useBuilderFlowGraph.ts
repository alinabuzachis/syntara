import { ActivityTypeEnum, EdgeHandleEnum, type Activity } from '@ansible/nexus-contracts'
import { useMemo } from 'react'

import { buildTriggerNodeId } from '../../../utils/triggerNodeIds'
import type { NodeType } from '../../automations/canvas/nodes/NodeType'
import type { ActivityState } from '../../automations/execution/types'
import type { EdgeConnection } from '../types/edge'
import { detectLoopBackNodes } from '../utils/detectLoopBackNodes'
import { ExecutionStateEnricher, type ActivityWithMetadata } from '../utils/executionState'
import {
  extractTaskActivities,
  getTriggerDisplayData,
  markerEnd,
  type EdgeType,
  type TaskActivity,
  type Trigger,
} from '../utils/workflowToGraph'

import { applyLoopBackNodeTypes } from './useLoopBackNodeTypes'

const executionStateEnricher = new ExecutionStateEnricher()

const LOOP_NODE_WIDTH = 290
const HORIZONTAL_SPACING = 50

interface UseBuilderFlowGraphParams {
  currentWorkflow: {
    inputs?: Record<string, unknown>
    workflow: { activities: Activity[] }
    triggers?: Trigger[]
  } | null
  triggers: Trigger[] | undefined
  activities: Activity[] | undefined
  storedEdges: EdgeConnection[]
  executionStatus: string | null | undefined
  activityStates: Map<string, ActivityState>
  onAddNodeFromEdge: ((sourceNodeId: string, sourceHandle: string) => void) | undefined
  workflowVersion: number
}

export { executionStateEnricher }

export function useBuilderFlowGraph({
  currentWorkflow,
  triggers,
  activities: activitiesFromStore,
  storedEdges,
  executionStatus,
  activityStates,
  onAddNodeFromEdge,
  workflowVersion,
}: UseBuilderFlowGraphParams) {
  return useMemo(() => {
    if (!currentWorkflow) {
      return { nodes: [] as NodeType[], edges: [] as EdgeType[] }
    }

    const nodes: NodeType[] = []
    const edges: EdgeType[] = []
    const previousIds: string[] = []

    const triggersList = triggers ?? []
    triggersList.forEach((trigger: Trigger, index: number) => {
      const triggerId = buildTriggerNodeId(index)
      const { name, details } = getTriggerDisplayData(trigger)
      const triggerData = {
        name,
        details,
        triggerType: trigger.type,
        inputs: currentWorkflow?.inputs ?? {},
      }
      const enrichedTriggerData = executionStateEnricher.enrichTriggerNode(
        triggerId,
        triggerData,
        executionStatus,
        storedEdges,
        activityStates
      )
      nodes.push({
        id: triggerId,
        type: 'trigger',
        position: { x: 0, y: 0 },
        data: enrichedTriggerData,
      })
      previousIds.push(triggerId)
    })

    const activities = currentWorkflow?.workflow.activities ?? []

    activities.forEach((activity: Activity) => {
      if (
        activity.type !== ActivityTypeEnum.CONVERGE &&
        activity.type !== ActivityTypeEnum.CONDITION &&
        activity.type !== ActivityTypeEnum.LOOP
      ) {
        return
      }

      const activityData = executionStateEnricher.enrichActivity(activity, executionStatus, activityStates, storedEdges)
      nodes.push({
        id: activity.id,
        type: activity.type,
        position: { x: 0, y: 0 },
        // @ts-expect-error - ActivityWithMetadata extends Activity, safe to use
        data: activityData,
      })
    })

    storedEdges.forEach(
      (edge: {
        id: string
        source: string
        target: string
        sourceHandle?: string | null
        targetHandle?: string | null
      }) => {
        let edgeType: string = 'default'
        if (edge.targetHandle === EdgeHandleEnum.END) {
          edgeType = 'loopBack'
        } else if (edge.sourceHandle === EdgeHandleEnum.LOOP) {
          edgeType = 'loopOutgoing'
        }

        let edgeExecutionStatus: 'passed' | 'pending' | undefined
        if (executionStatus) {
          edgeExecutionStatus = executionStateEnricher.determineEdgeStatus(edge, activityStates, activities)
        }

        edges.push({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle ?? undefined,
          targetHandle: edge.targetHandle ?? undefined,
          type: edgeType,
          markerEnd,
          data: {
            onAddNode: onAddNodeFromEdge,
            executionStatus: edgeExecutionStatus,
          },
        })
      }
    )

    const taskActivities = extractTaskActivities(activities)

    const loopBodyNodes = new Set<string>()
    storedEdges.forEach((edge) => {
      if (edge.sourceHandle === EdgeHandleEnum.LOOP) {
        loopBodyNodes.add(edge.target)
      }
    })

    taskActivities.forEach((activity: TaskActivity | Extract<Activity, { type: 'approval' }>) => {
      const isGeneric = (activity as ActivityWithMetadata).metadata?.__isGeneric === true
      const isApproval = activity.type === ActivityTypeEnum.APPROVAL

      let position = { x: 0, y: 0 }
      if (loopBodyNodes.has(activity.id)) {
        position = { x: LOOP_NODE_WIDTH + HORIZONTAL_SPACING, y: 0 }
      }

      let nodeType: 'generic' | 'approval' | 'task' = 'task'
      if (isGeneric) {
        nodeType = 'generic'
      } else if (isApproval) {
        nodeType = 'approval'
      }

      const activityData = executionStateEnricher.enrichActivity(activity, executionStatus, activityStates, storedEdges)

      nodes.push({
        id: activity.id,
        type: nodeType,
        position,
        // @ts-expect-error - ActivityWithMetadata extends Activity, safe to use
        data: activityData,
      })
    })

    const loopBackNodeIds = detectLoopBackNodes(edges, nodes)
    const finalNodes = applyLoopBackNodeTypes(nodes, loopBackNodeIds)

    return { nodes: finalNodes, edges }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    workflowVersion,
    currentWorkflow?.inputs,
    triggers,
    activitiesFromStore,
    storedEdges,
    onAddNodeFromEdge,
    activityStates,
    executionStatus,
  ])
}
