import {
  ActivityTypeEnum,
  EdgeHandleEnum,
  TriggerTypeEnum,
  type Activity,
  type NodeSettings,
} from '@ansible/nexus-contracts'

import { safeJSONReviver } from '../utils/jsonSafeParse'
import { isValidWebhookPath } from '../utils/webhookPath'

import type { ActivityWithMetadata } from './workflowStoreTypes'

// ============================================================================
// V2 Workflow Entity Factory Functions
// ============================================================================
// These functions create properly typed v2 workflow entities.
// They are pure functions and don't interact with the store directly.
//
// V2 key differences from v1:
//   - Executor nodes use direct type ("script", "http_request", …)
//     instead of type "task" with a task.executor wrapper
//   - Parameters live at node.parameters (not nested under task.parameters)
//   - Control flow nodes store parameters in node.parameters
//   - Triggers have id and parameters fields
//   - No nested child arrays (then/else/do/onApproved/onRejected)
// ============================================================================

// ============================================================================
// Trigger Factory Functions
// ============================================================================

/**
 * Create a manual trigger (v2).
 */
export function createManualTrigger(
  id: string,
  _requiresApproval?: boolean,
  name?: string,
  inputSchema?: Record<string, unknown>
): Activity {
  return {
    id,
    type: TriggerTypeEnum.MANUAL_TRIGGER,
    name: name ?? 'Manual Trigger',
    parameters: {
      ...(inputSchema && { input_schema: inputSchema }),
    },
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
): Activity {
  return {
    id,
    type: TriggerTypeEnum.SCHEDULED,
    name: name ?? 'Scheduled Trigger',
    parameters: {
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
): Activity {
  return {
    id,
    type: TriggerTypeEnum.EVENT,
    name: name ?? 'Event Trigger',
    parameters: {
      source,
      event_type: eventType,
      ...(filter && { filter }),
    },
  }
}

function createWebhookStyleTrigger(
  id: string,
  webhookPath: string,
  type: typeof TriggerTypeEnum.WEBHOOK_TRIGGER | typeof TriggerTypeEnum.EDA_TRIGGER,
  name: string,
  inputSchema?: Record<string, unknown>
): Activity {
  if (!isValidWebhookPath(webhookPath)) {
    throw new Error('Invalid webhook path format')
  }
  return {
    id,
    type,
    name,
    parameters: {
      webhook_path: webhookPath,
      ...(inputSchema && { input_schema: inputSchema }),
    },
  }
}

/**
 * Create a webhook trigger (v2).
 */
export function createWebhookTrigger(
  id: string,
  webhookPath: string,
  inputSchema?: Record<string, unknown>,
  name?: string
): Activity {
  return createWebhookStyleTrigger(
    id,
    webhookPath,
    TriggerTypeEnum.WEBHOOK_TRIGGER,
    name ?? 'Webhook Trigger',
    inputSchema
  )
}

/**
 * Create an EDA trigger (v2).
 */
export function createEdaTrigger(
  id: string,
  webhookPath: string,
  inputSchema?: Record<string, unknown>,
  name?: string
): Activity {
  return createWebhookStyleTrigger(id, webhookPath, TriggerTypeEnum.EDA_TRIGGER, name ?? 'EDA Trigger', inputSchema)
}

// ============================================================================
// Executor Node Factory Functions
// ============================================================================

export type CreateScriptActivityOptions = {
  id: string
  name: string
  language: string
  code: string
  credentialId?: string
  settings?: NodeSettings
}

/**
 * Create a script node (v2).
 */
export function createScriptActivity(options: CreateScriptActivityOptions): Activity {
  const { id, name, language, code, credentialId, settings } = options
  return {
    id,
    type: ActivityTypeEnum.SCRIPT,
    name,
    parameters: {
      language,
      code,
      ...(credentialId && { credential_id: credentialId }),
    },
    ...(settings && { settings }),
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
  settings?: NodeSettings
}

/**
 * Create an HTTP request node (v2).
 */
export function createApiActivity(options: CreateApiActivityOptions): Activity {
  const { id, name, method, url, headers, body, authentication, credentialId, settings } = options
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
    parameters: {
      ...config,
      ...(credentialId && { credential_id: credentialId }),
    },
    ...(settings && { settings }),
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
  responseSchema?: Record<string, unknown>
  settings?: NodeSettings
}

/**
 * Create an agentic node (v2).
 */
export function createAgenticActivity(options: CreateAgenticActivityOptions): Activity {
  const { id, name, tools, prompt, model, fileIds, credentialId, responseSchema, settings } = options
  const config: Record<string, unknown> = {}

  if (prompt) config.prompt = prompt
  if (model) config.model = model
  if (tools && tools.length > 0) config.tool_selections = tools
  if (fileIds && fileIds.length > 0) config.file_ids = fileIds
  if (credentialId) config.credential_id = credentialId
  if (responseSchema) config.response_schema = responseSchema

  return {
    id,
    type: ActivityTypeEnum.AGENTIC,
    name,
    parameters: config,
    ...(settings && { settings }),
  }
}

/**
 * AAP Job Template config — matches the backend AAPJobTemplateExecutorConfig fields.
 */
export type AAPJobTemplateConfig = {
  credentialId?: string // Nexus credential for AAP authentication
  organizationId?: number
  organization?: string
  jobTemplateName?: string
  inventory?: number
  inventoryName?: string
  extraVars?: Record<string, unknown>
  limit?: string
  tags?: string
  skipTags?: string
  verbosity?: number
  jobCredentials?: number[] // AAP Controller credential IDs for job execution (prompt-on-launch override)
  jobType?: string
  forks?: number
  jobSlicing?: number
  diffMode?: boolean
  executionEnvironment?: string
  executionEnvironmentId?: number
  instanceGroupId?: number
  instanceGroupName?: string
  labels?: string[] // AAP Controller label names (prompt-on-launch override, supports creating new labels)
}

/** Mapping from AAPJobTemplateConfig key → API config key, with a predicate type. */
const aapConfigMapping: [keyof AAPJobTemplateConfig, string, 'truthy' | 'defined'][] = [
  ['credentialId', 'credential_id', 'truthy'],
  ['organizationId', 'organization_id', 'defined'],
  ['organization', 'organization_name', 'truthy'],
  ['jobTemplateName', 'job_template_name', 'truthy'],
  ['inventory', 'inventory_id', 'defined'],
  ['inventoryName', 'inventory_name', 'truthy'],
  ['extraVars', 'extra_vars', 'truthy'],
  ['limit', 'limit', 'truthy'],
  ['tags', 'tags', 'truthy'],
  ['skipTags', 'skip_tags', 'truthy'],
  ['verbosity', 'verbosity', 'defined'],
  ['jobCredentials', 'job_credentials', 'defined'],
  ['jobType', 'job_type', 'truthy'],
  ['forks', 'forks', 'defined'],
  ['jobSlicing', 'job_slice_count', 'defined'],
  ['diffMode', 'diff_mode', 'defined'],
  ['executionEnvironment', 'execution_environment', 'truthy'],
  ['executionEnvironmentId', 'execution_environment_id', 'defined'],
  ['instanceGroupId', 'instance_group_id', 'defined'],
  ['instanceGroupName', 'instance_group_name', 'truthy'],
  ['labels', 'labels', 'truthy'],
]

/**
 * Create an AAP Job Template node (v2).
 */
export function createAAPJobTemplateActivity(
  id: string,
  name: string,
  jobTemplateId: number,
  config?: AAPJobTemplateConfig,
  settings?: NodeSettings
): Activity {
  const activityConfig: Record<string, unknown> = { job_template_id: jobTemplateId }

  if (config) {
    for (const [srcKey, destKey, predicate] of aapConfigMapping) {
      const value = config[srcKey]
      const include =
        predicate === 'defined'
          ? value !== undefined && (typeof value !== 'number' || Number.isFinite(value))
          : Boolean(value)
      if (include) {
        activityConfig[destKey] = value
      }
    }
  }

  return {
    id,
    type: ActivityTypeEnum.AAP_JOB_TEMPLATE,
    name,
    parameters: activityConfig,
    ...(settings && { settings }),
  }
}

/**
 * AAP Workflow Template config — matches the backend AAPWorkflowTemplateExecutorConfig fields.
 * Workflow templates do NOT support job-specific fields like job_type, verbosity, forks, etc.
 * Timeout is configured via node settings, not here.
 */
export type AAPWorkflowTemplateConfig = {
  credential_id?: string // Nexus credential for AAP authentication
  organization_id?: number
  organization_name?: string
  workflow_job_template_name?: string
  inventory_id?: number
  inventory_name?: string
  extra_vars?: Record<string, unknown>
  limit?: string
  scm_branch?: string // Workflow-specific: source control branch override
  tags?: string
  skip_tags?: string
  labels?: string[] // AAP Controller label names (prompt-on-launch override, supports creating new labels)
}

/**
 * Create an AAP Workflow Template node (v2).
 */
export function createAAPWorkflowTemplateActivity(
  id: string,
  name: string,
  workflowTemplateId: number,
  config?: AAPWorkflowTemplateConfig,
  settings?: NodeSettings
): Activity {
  const activityConfig: Record<string, unknown> = { workflow_job_template_id: workflowTemplateId }

  // Config already uses snake_case field names matching the API contract
  // Filter out undefined/null/empty/invalid values while copying
  if (config) {
    for (const [key, value] of Object.entries(config)) {
      // Skip undefined/null
      if (value === undefined || value === null) continue
      // For numbers: skip NaN and Infinity, but allow 0
      if (typeof value === 'number' && !Number.isFinite(value)) continue
      // For strings: skip empty strings (truthy predicate)
      if (typeof value === 'string' && value === '') continue
      // For all other types (including 0, false, arrays, objects): include
      activityConfig[key] = value
    }
  }

  return {
    id,
    type: ActivityTypeEnum.AAP_WORKFLOW_JOB_TEMPLATE,
    name,
    parameters: activityConfig,
    ...(settings && { settings }),
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
  fallback_decision?: 'approve' | 'reject'
  decision_window?: number
  settings?: NodeSettings
}

/**
 * Create an approval node (v2).
 */
export function createApprovalActivity(options: CreateApprovalActivityOptions): Activity {
  const { id, name, fallback_decision, decision_window, settings } = options
  return {
    id,
    type: ActivityTypeEnum.APPROVAL,
    name,
    parameters: {
      ...(fallback_decision && { fallback_decision }),
      ...(decision_window !== undefined && { decision_window }),
    },
    ...(settings && { settings }),
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
    parameters: {
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
    indexVariable?: string
    itemVariable?: string
  },
  settings?: NodeSettings
): Activity {
  const maxIterations =
    config.maxIterations !== undefined && !Number.isNaN(config.maxIterations) ? config.maxIterations : undefined

  if (loopType === 'forEach') {
    return {
      id,
      type: ActivityTypeEnum.LOOP,
      name,
      parameters: {
        type: 'for_each',
        items: config.items ?? '',
        ...(maxIterations !== undefined && { max_iterations: maxIterations }),
      },
      ...(settings && { settings }),
    }
  }

  return {
    id,
    type: ActivityTypeEnum.LOOP,
    name,
    parameters: {
      type: 'do_while',
      condition: config.condition ?? '',
      ...(maxIterations !== undefined && { max_iterations: maxIterations }),
    },
    ...(settings && { settings }),
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
    requiredPathCount?: number
    wait_duration?: number
  },
  settings?: NodeSettings
): Activity {
  return {
    id,
    type: ActivityTypeEnum.CONVERGE,
    name,
    parameters: {
      strategy: config?.strategy ?? 'all',
      ...(config?.strategy === 'any' && config?.requiredPathCount != null && { n_required: config.requiredPathCount }),
      ...(config?.wait_duration !== undefined && { wait_duration: config.wait_duration }),
    },
    ...(settings && { settings }),
  }
}

/**
 * Create a switch node (v2).
 */
export function createSwitchActivity(
  id: string,
  name: string,
  cases: Array<{ port: string; label: string; condition: string }>
): Activity {
  return {
    id,
    type: ActivityTypeEnum.SWITCH,
    name,
    parameters: {
      cases,
      default_port: EdgeHandleEnum.DEFAULT,
    },
  }
}

/**
 * Create a wait node (v2).
 */
export function createWaitActivity(
  id: string,
  name: string,
  config: { duration: number },
  settings?: NodeSettings
): Activity {
  return {
    id,
    type: ActivityTypeEnum.WAIT,
    name,
    parameters: config,
    ...(settings && { settings }),
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
    parameters: {},
    metadata: {
      __isGeneric: true,
      ...(customMessage ? { __customMessage: customMessage } : {}),
    },
  }
}
