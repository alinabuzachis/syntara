import type { WorkflowAPI } from '@ansible/nexus-contracts'

import { workflowFetchClient } from '../../client'

type Workflow = WorkflowAPI.components['schemas']['WorkflowRead']

type TriggerLike = {
  id?: string
  name?: string
  parameters?: {
    input_schema?: Record<string, unknown>
  }
}

export type WorkflowRunTrigger = {
  triggerNodeId: string
  triggerName: string
  inputSchema?: Record<string, unknown>
}

/**
 * Show the input modal when the trigger has a usable input schema.
 * Empty `properties` objects do not count — that would open a modal with no fields.
 */
export function hasTriggerInputSchema(schema?: Record<string, unknown> | null): boolean {
  if (schema == null) return false
  const properties = schema.properties
  if (properties != null && typeof properties === 'object' && !Array.isArray(properties)) {
    return Object.keys(properties).length > 0
  }
  return Object.keys(schema).length > 0
}

function isTriggerLike(value: unknown): value is TriggerLike {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function extractTriggers(definition: unknown): TriggerLike[] | undefined {
  if (!definition || typeof definition !== 'object') return undefined
  const triggers = (definition as { triggers?: unknown }).triggers
  if (!Array.isArray(triggers)) return undefined
  return triggers.filter(isTriggerLike)
}

/**
 * Resolve the first trigger from the workflow's published definition for a list-page run.
 * Prefers the published version when it differs from the current draft.
 */
export async function resolveWorkflowRunTrigger(workflow: Workflow): Promise<WorkflowRunTrigger | null> {
  if (!workflow.id) return null

  const { data: detail, error } = await workflowFetchClient.GET('/workflows/{workflow_id}', {
    params: { path: { workflow_id: workflow.id } },
  })
  if (error || !detail) return null

  const publishedVersionNumber = workflow.published_version_number ?? detail.published_version_number
  const currentVersionNumber = detail.current_version
  let triggers = extractTriggers(detail.version?.workflow_definition)

  if (
    publishedVersionNumber != null &&
    currentVersionNumber != null &&
    publishedVersionNumber !== currentVersionNumber
  ) {
    const { data: publishedVersion, error: versionError } = await workflowFetchClient.GET(
      '/workflows/{workflow_id}/versions/{version}',
      {
        params: { path: { workflow_id: workflow.id, version: publishedVersionNumber } },
      }
    )
    if (!versionError && publishedVersion) {
      triggers = extractTriggers(publishedVersion.workflow_definition) ?? triggers
    }
  }

  const trigger = triggers?.[0]
  if (!trigger?.id) return null

  const inputSchema = trigger.parameters?.input_schema
  return {
    triggerNodeId: trigger.id,
    triggerName: trigger.name ?? 'Trigger',
    inputSchema: inputSchema && typeof inputSchema === 'object' ? inputSchema : undefined,
  }
}
