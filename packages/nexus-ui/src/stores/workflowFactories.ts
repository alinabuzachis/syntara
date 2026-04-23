import { ActivityTypeEnum, type Activity } from '@ansible/nexus-contracts'

import type { ActivityWithMetadata } from './workflowStoreTypes'

/**
 * SECURITY: JSON.parse reviver that strips prototype pollution keys during parsing.
 */
function safeJSONReviver(key: string, value: unknown): unknown {
  if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
    return undefined
  }
  return value
}

// ============================================================================
// V2 Workflow Entity Factory Functions
// ============================================================================
// These functions create properly typed v2 workflow entities.
// They are pure functions and don't interact with the store directly.
//
// V2 key differences from v1:
//   - Executor nodes use direct type ("script", "http_request", …)
//     instead of type "task" with a task.executor wrapper
//   - Config lives at node.config (not nested under task.config)
//   - Control flow nodes store config in node.config
//   - Triggers have id and config fields
//   - No nested child arrays (then/else/do/onApproved/onRejected)
// ============================================================================

// ============================================================================
// Trigger Factory Functions
// ============================================================================

/**
 * Create a manual trigger (v2).
 */
export function createManualTrigger(id: string, _requiresApproval?: boolean, name?: string): Activity {
  return {
    id,
    type: 'manual_trigger',
    name: name ?? 'Manual Trigger',
    config: {},
  }
}

/**
 * Create a scheduled trigger (v2).
 * @note This trigger type is not yet in the v2 backend schema
 */
export function createScheduledTrigger(
  id: string,
  scheduleType: 'cron' | 'interval' | 'continuous',
  config: {
    cron?: string
    timezone?: string
    interval?: string
  },
  name?: string
) {
  return {
    id,
    type: 'scheduled',
    name: name ?? 'Scheduled Trigger',
    config: {
      schedule_type: scheduleType,
      ...(config.cron && { cron: config.cron }),
      ...(config.timezone && { timezone: config.timezone }),
      ...(config.interval && { interval: config.interval }),
    },
  }
}

/**
 * Create an event trigger (v2).
 * @note This trigger type is not yet in the v2 backend schema
 */
export function createEventTrigger(
  id: string,
  source: string,
  eventType: string,
  filter?: Record<string, unknown>,
  name?: string
) {
  return {
    id,
    type: 'event',
    name: name ?? 'Event Trigger',
    config: {
      source,
      event_type: eventType,
      ...(filter && { filter }),
    },
  }
}

// ============================================================================
// Executor Node Factory Functions
// ============================================================================

/**
 * Create a script node (v2).
 */
export function createScriptActivity(
  id: string,
  name: string,
  language: string,
  code: string,
  credentialId?: string
): Activity {
  return {
    id,
    type: ActivityTypeEnum.SCRIPT,
    name,
    config: {
      language,
      code,
      ...(credentialId && { credential_id: credentialId }),
    },
  }
}

export type CreateApiActivityOptions = {
  id: string
  name: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  url: string
  headers?: string
  body?: string
  inputs?: string
  authentication?: string
  credentialId?: string
}

/**
 * Create an HTTP request node (v2).
 */
export function createApiActivity(options: CreateApiActivityOptions): Activity {
  const { id, name, method, url, headers, body, authentication, credentialId } = options
  const config: Record<string, unknown> = { method, url }

  if (headers) {
    try {
      // SECURITY: Use reviver to strip prototype pollution keys
      config.headers = JSON.parse(headers, safeJSONReviver) as { [key: string]: string }
    } catch {
      // If headers is not valid JSON, skip it
    }
  }

  if (authentication) {
    const existingHeaders = config.headers as Record<string, string> | undefined
    config.headers = {
      ...existingHeaders,
      Authorization: authentication,
    }
  }

  if (body) {
    try {
      // SECURITY: Use reviver to strip prototype pollution keys
      config.body = JSON.parse(body, safeJSONReviver) as unknown
    } catch {
      config.body = body
    }
  }

  return {
    id,
    type: ActivityTypeEnum.HTTP_REQUEST,
    name,
    config: {
      ...config,
      ...(credentialId && { credential_id: credentialId }),
    },
  }
}

export type CreateAgenticActivityOptions = {
  id: string
  name: string
  tools?: string[]
  prompt?: string
  model?: string
  inputs?: string
  fileIds?: string[]
  credentialId?: string
}

/**
 * Create an agentic node (v2).
 */
export function createAgenticActivity(options: CreateAgenticActivityOptions): Activity {
  const { id, name, tools, prompt, model, fileIds, credentialId } = options
  const config: Record<string, unknown> = {}

  if (prompt) config.prompt = prompt
  if (model) config.model = model
  if (tools && tools.length > 0) config.tool_selections = tools
  if (fileIds && fileIds.length > 0) config.file_ids = fileIds
  if (credentialId) config.credential_id = credentialId

  return {
    id,
    type: ActivityTypeEnum.AGENTIC,
    name,
    config,
  }
}

/**
 * AAP Job Template config — matches the backend AAPJobTemplateExecutorConfig fields.
 * Uses snake_case to match API contract.
 */
export type AAPJobTemplateConfig = {
  credentialId?: string // Nexus credential for AAP authentication
  organizationName?: string
  jobTemplateName?: string
  inventoryId?: number
  inventoryName?: string
  extraVars?: Record<string, unknown>
  limit?: string
  tags?: string
  skipTags?: string
  verbosity?: number
  jobCredentials?: number[] // AAP Controller credentials (prompt-on-launch override)
  jobType?: string
  forks?: number
  timeout?: number
  jobSliceCount?: number
  diffMode?: boolean
  executionEnvironment?: string
  instanceGroups?: string
  labels?: string
}

/**
 * Create an AAP Job Template node (v2).
 * Converts camelCase config fields to snake_case for API contract.
 */
export function createAAPJobTemplateActivity(
  id: string,
  name: string,
  jobTemplateId: number,
  config?: AAPJobTemplateConfig
): Activity {
  const activityConfig: Record<string, unknown> = { job_template_id: jobTemplateId }

  if (config) {
    // Map camelCase config fields to snake_case for API
    const fieldMapping: Record<keyof AAPJobTemplateConfig, string> = {
      credentialId: 'credential_id',
      organizationName: 'organization_name',
      jobTemplateName: 'job_template_name',
      inventoryId: 'inventory_id',
      inventoryName: 'inventory_name',
      extraVars: 'extra_vars',
      limit: 'limit',
      tags: 'tags',
      skipTags: 'skip_tags',
      verbosity: 'verbosity',
      jobCredentials: 'job_credentials',
      jobType: 'job_type',
      forks: 'forks',
      timeout: 'timeout',
      jobSliceCount: 'job_slice_count',
      diffMode: 'diff_mode',
      executionEnvironment: 'execution_environment',
      instanceGroups: 'instance_groups',
      labels: 'labels',
    }

    for (const [camelKey, snakeKey] of Object.entries(fieldMapping)) {
      const value = config[camelKey as keyof AAPJobTemplateConfig]
      const include = value !== undefined && (typeof value === 'boolean' || typeof value === 'number' || value)
      if (include) {
        activityConfig[snakeKey] = value
      }
    }
  }

  return {
    id,
    type: ActivityTypeEnum.AAP_JOB_TEMPLATE,
    name,
    config: activityConfig,
  }
}

// ============================================================================
// Approval Node Factory
// ============================================================================

export type CreateApprovalActivityOptions = {
  id: string
  name: string
  approvers: string[]
  prompt: string
  timeout?: number
  onTimeout?: 'fail' | 'approve' | 'reject'
}

/**
 * Create an approval node (v2).
 */
export function createApprovalActivity(options: CreateApprovalActivityOptions): Activity {
  const { id, name, timeout } = options
  return {
    id,
    type: ActivityTypeEnum.APPROVAL,
    name,
    config: {
      ...(timeout !== undefined && { approver_timeout: timeout }),
    },
  }
}

// ============================================================================
// Control Flow Node Factory Functions
// ============================================================================

/**
 * Create a condition node (v2).
 */
export function createConditionActivity(id: string, name: string, condition: string): Activity {
  return {
    id,
    type: ActivityTypeEnum.CONDITION,
    name,
    config: {
      condition,
    },
  }
}

/**
 * Create a loop node (v2).
 */
export function createLoopActivity(
  id: string,
  name: string,
  loopType: 'forEach' | 'while',
  config: {
    items?: string
    condition?: string
    maxIterations?: number
    maxIterationsBehavior?: 'continue' | 'fail'
    indexVariable?: string
    itemVariable?: string
  }
): Activity {
  if (loopType === 'forEach') {
    return {
      id,
      type: ActivityTypeEnum.LOOP,
      name,
      config: {
        type: 'for_each',
        items: config.items ?? '',
      },
    }
  }

  // do_while
  const loopConfig: Record<string, unknown> = {
    type: 'do_while',
    condition: config.condition ?? '',
  }
  if (config.maxIterations !== undefined && !Number.isNaN(config.maxIterations)) {
    loopConfig.max_iterations = config.maxIterations
  }

  return {
    id,
    type: ActivityTypeEnum.LOOP,
    name,
    config: loopConfig,
  }
}

/**
 * Create a converge node (v2).
 */
export function createConvergeActivity(
  id: string,
  name: string,
  config?: {
    strategy?: 'all' | 'any'
    timeout?: number
    onTimeout?: 'continue' | 'fail'
    aggregateOutputs?: boolean
    requiredPathCount?: number
    remainingBehavior?: 'continue' | 'cancel'
  }
): Activity {
  return {
    id,
    type: ActivityTypeEnum.CONVERGE,
    name,
    config: {
      strategy: config?.strategy ?? 'all',
      ...(config?.onTimeout && { on_timeout: config.onTimeout }),
    },
  }
}

/**
 * Create a generic placeholder node (v2).
 * UI-only concept — not backed by a v2 backend schema.
 * Metadata is stored in the `metadata` field (not `config`) for proper detection.
 *
 * SECURITY: Uses ActivityWithMetadata type instead of unsafe `as Activity` cast.
 * Metadata properties are restricted to the allowlist defined in ActivityMetadata interface.
 */
export function createGenericActivity(
  id: string,
  name: string = 'New Step',
  customMessage?: string
): ActivityWithMetadata {
  return {
    id,
    type: 'generic',
    name,
    config: {},
    metadata: {
      __isGeneric: true,
      ...(customMessage ? { __customMessage: customMessage } : {}),
    },
  }
}
