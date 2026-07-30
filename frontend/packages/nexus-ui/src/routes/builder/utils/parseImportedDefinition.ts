import type { Activity } from '@syntara/contracts'

import type { WorkflowDefinition } from '../../../stores/workflowStoreTypes'
import type { EdgeConnection } from '../types/edge'

import { convertV2Definition, parseNodePositions } from './processExistingWorkflow'

/** Converts a raw imported workflow definition into the builder's internal format. */
export function parseImportedDefinition(definition: Record<string, unknown>): {
  workflowDef: WorkflowDefinition
  edges: EdgeConnection[]
  nodePositions: Record<string, { x: number; y: number }>
} {
  const rawNodes = ((definition.nodes as unknown[]) ?? []) as Array<Record<string, unknown>>
  const rawTriggers = ((definition.triggers as unknown[]) ?? []) as Array<Record<string, unknown>>

  const { flattenedActivities, edges, triggers } = convertV2Definition(
    rawNodes as Activity[],
    ((definition.edges as unknown[]) ?? []) as Array<{
      from: string
      to: string
      from_port?: string
      to_port?: string
    }>,
    rawTriggers
  )

  const nodePositions = parseNodePositions([...rawNodes, ...rawTriggers])

  const workflowDef = {
    name: typeof definition.name === 'string' ? definition.name : undefined,
    description: typeof definition.description === 'string' ? definition.description : undefined,
    triggers,
    workflow: { activities: flattenedActivities },
  } as unknown as WorkflowDefinition

  return { workflowDef, edges, nodePositions }
}
