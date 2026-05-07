import type { Activity } from '@ansible/nexus-contracts'

import type { WorkflowDefinition } from '../../../stores/workflowStoreTypes'
import type { EdgeConnection } from '../types/edge'

import { convertV2Definition } from './processExistingWorkflow'

/**
 * Takes a parsed workflow definition (from an imported JSON file) and
 * converts it into the internal store format used by the builder.
 */
export function loadDefinitionIntoStore(definition: Record<string, unknown>): {
  workflowDef: WorkflowDefinition
  edges: EdgeConnection[]
} {
  const { flattenedActivities, edges, triggers } = convertV2Definition(
    ((definition.nodes as unknown[]) ?? []) as Activity[],
    ((definition.edges as unknown[]) ?? []) as Array<{
      from: string
      to: string
      from_port?: string
      to_port?: string
    }>,
    ((definition.triggers as unknown[]) ?? []) as Array<Record<string, unknown>>
  )

  const workflowDef = {
    name: typeof definition.name === 'string' ? definition.name : undefined,
    description: typeof definition.description === 'string' ? definition.description : undefined,
    triggers,
    workflow: { activities: flattenedActivities },
  } as unknown as WorkflowDefinition

  return { workflowDef, edges }
}
