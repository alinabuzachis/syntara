import type { Activity, WorkflowAPI } from '@ansible/nexus-contracts'

import { getActivityMetadata } from '../../../stores/useWorkflowStore'
import type { WorkflowDefinition } from '../../../stores/workflowStoreTypes'
import { buildTriggerNodeId } from '../../../utils/triggerNodeIds'
import type { EdgeConnection } from '../types/edge'

import { v2PortToHandle } from './edgeHelpers'
import { DEFAULT_WORKFLOW_NAME } from './workflowNaming'

type WorkflowWithVersion = WorkflowAPI.components['schemas']['WorkflowWithVersion']

/**
 * Processes a raw workflow-with-version from the API into the internal store
 * representation (flat activities, React Flow edges, init payload).
 */
export function processExistingWorkflow(workflow: WorkflowWithVersion) {
  const workflowDef = workflow.version!.workflow_definition!

  const nodes = (workflowDef.nodes ?? []) as Activity[]
  const v2Edges = (workflowDef.edges ?? []) as Array<{
    from: string
    to: string
    from_port?: string
    to_port?: string
  }>

  const triggers = (workflowDef.triggers ?? []).map((t, index) => {
    const trigger = t as { id?: string; type?: string }
    if (!trigger.id) {
      return { ...t, id: `${trigger.type ?? 'trigger'}_${index}` }
    }
    return t
  })

  const flattenedActivities = nodes.map((a) => {
    const meta = getActivityMetadata(a)
    if (meta) return { ...a, metadata: meta }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructuring to strip metadata
    const { metadata: _unsanitized, ...rest } = a as Activity & { metadata?: unknown }
    return rest as Activity
  })

  const triggerIdToDisplayId = new Map<string, string>()
  triggers.forEach((t, index) => {
    const defId = (t as { id?: string }).id
    if (defId) {
      triggerIdToDisplayId.set(defId, buildTriggerNodeId(index))
    }
  })

  const validNodeIds = new Set<string>()
  flattenedActivities.forEach((a) => validNodeIds.add(a.id))
  triggers.forEach((_, index) => validNodeIds.add(buildTriggerNodeId(index)))

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

  const flattenedWorkflow = {
    ...workflowDef,
    workflow: { activities: flattenedActivities },
  } as unknown as WorkflowDefinition

  const tagKeys = Object.keys(workflow.labels ?? {})

  return {
    flattenedWorkflow,
    generatedEdges,
    initPayload: {
      name: workflow.name,
      description: workflow.description ?? workflow.name ?? DEFAULT_WORKFLOW_NAME,
      tags: tagKeys,
      isEnabled: workflow.is_enabled ?? false,
    },
  }
}
