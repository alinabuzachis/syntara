import * as ApprovalsAPI from './approvals-api.js'
import * as ExecutionsAPI from './executions-api.js'
import * as ToolManagerAPI from './tool-manager.js'
import * as UsersAPI from './users-api.js'
import * as WorkflowAPI from './workflow-api.js'

type WithId<T> = T & { readonly id: string }

export type Group = WithId<UsersAPI.components['schemas']['GroupRead']>
export type User = WithId<UsersAPI.components['schemas']['UserRead']>

export type Execution = WithId<ExecutionsAPI.components['schemas']['ExecutionRead']>
export type ActivityExecution = ExecutionsAPI.components['schemas']['ActivityExecution']
export type Approval = WithId<ApprovalsAPI.components['schemas']['ApprovalRequestRead']>
export type ExecutionStatus = ExecutionsAPI.components['schemas']['ExecutionStatus']
export type ApprovalStatus = ApprovalsAPI.components['schemas']['ApprovalRequestStatus']
export type Workflow = WithId<WorkflowAPI.components['schemas']['Workflow']>

/**
 * Constants for node type discriminators (v2)
 * In v2, executor types are first-class node types — no 'task' wrapper.
 */
export const ActivityTypeEnum = {
  SCRIPT: 'script',
  HTTP_REQUEST: 'http_request',
  AGENTIC: 'agentic',
  AAP_JOB_TEMPLATE: 'aap_job_template',
  AAP_WORKFLOW_JOB_TEMPLATE: 'aap_workflow_job_template',
  APPROVAL: 'approval',
  CONDITION: 'condition',
  LOOP: 'loop',
  CONVERGE: 'converge',
  SWITCH: 'switch',
  WAIT: 'wait',
} as const

/**
 * Constants for trigger type discriminators (v2)
 */
export const TriggerTypeEnum = {
  MANUAL_TRIGGER: 'manual_trigger',
  SCHEDULED: 'scheduled',
  EVENT: 'event',
  WEBHOOK_TRIGGER: 'webhook_trigger',
  EDA_TRIGGER: 'eda_trigger',
} as const

export type TriggerType = (typeof TriggerTypeEnum)[keyof typeof TriggerTypeEnum]

/**
 * Trigger types that share webhook-style config (webhook_path, input_schema).
 */
export const WEBHOOK_TRIGGER_TYPES: ReadonlySet<string> = new Set([
  TriggerTypeEnum.WEBHOOK_TRIGGER,
  TriggerTypeEnum.EDA_TRIGGER,
])

/**
 * Constants for executor node types (v2)
 * In v2, executor types are the node type directly — no task.executor wrapper.
 */
export const ExecutorTypeEnum = {
  SCRIPT: 'script',
  HTTP_REQUEST: 'http_request',
  AGENTIC: 'agentic',
  AAP_JOB_TEMPLATE: 'aap_job_template',
  AAP_WORKFLOW_JOB_TEMPLATE: 'aap_workflow_job_template',
  APPROVAL: 'approval',
} as const

/**
 * Constants for edge handle types
 * Use these constants instead of string literals when comparing edge.sourceHandle or edge.targetHandle values
 */
export const EdgeHandleEnum = {
  // Source handles
  SOURCE: 'source',
  LOOP: 'loop',
  TRUE: 'true',
  FALSE: 'false',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  DONE: 'done',
  DEFAULT: 'default',
  // Target handles
  TARGET: 'target',
  END: 'end',
} as const

/**
 * Constants for execution status discriminators
 * Use these constants instead of string literals when comparing execution.status values
 *
 * Derived from the ExecutionStatus schema in the OpenAPI contract:
 * `ExecutionsAPI.components['schemas']['ExecutionStatus']`
 */
export const ExecutionStatusEnum = {
  PENDING: 'pending',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  COMPLETED_WITH_ERRORS: 'completed_with_errors',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const

/**
 * Constants for tool provider status values
 * Use these constants instead of string literals when comparing provider.status values
 */
export const ProviderStatusEnum = {
  AVAILABLE: 'available',
  ERROR: 'error',
  VALIDATING: 'validating',
} as const

/**
 * Constants for workflow version status discriminators
 * Use these constants instead of string literals when comparing version status values
 */
export const WorkflowVersionStatusEnum = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  PREVIOUSLY_PUBLISHED: 'previously_published',
} as const

export type WorkflowVersionStatus = WorkflowAPI.components['schemas']['WorkflowVersionStatus']
export type WorkflowsResponse =
  WorkflowAPI.paths['/workflows']['get']['responses']['200']['content']['application/json']
export type WorkflowWithVersion = WorkflowAPI.components['schemas']['WorkflowWithVersion']
export type WorkflowWithVersionResponse =
  WorkflowAPI.paths['/workflows/{workflow_id}']['get']['responses']['200']['content']['application/json']

export type Tool = WithId<ToolManagerAPI.components['schemas']['ToolWithParameters']>

export type ToolProvider = WithId<ToolManagerAPI.components['schemas']['ToolProviderWithConfiguration']>
export type ToolProviderCreate = ToolManagerAPI.components['schemas']['ToolProviderCreate']
export type ToolProvidersResponse =
  ToolManagerAPI.paths['/tool_manager/tool_providers']['get']['responses']['200']['content']['application/json']

// V2 node types — generated from v2 OpenAPI spec
export type V2Node = WorkflowAPI.components['schemas']['node']
export type V2NodeBase = WorkflowAPI.components['schemas']['node_base']
export type V2TriggerNode = WorkflowAPI.components['schemas']['trigger_node']
export type V2Edge = WorkflowAPI.components['schemas']['edge']
export type V2WorkflowDefinition = WorkflowAPI.components['schemas']['workflow_definition.schema']
export type V2RetryPolicy = WorkflowAPI.components['schemas']['retry_policy']

// ============================================================================
// Node-Level Settings Types (hand-written — settings live in .schema.json files,
// not in the OpenAPI spec, so they are not generated)
// ============================================================================

/** Per-node retry policy. All fields are optional — unset fields inherit from the global catalog. */
export interface RetryPolicyConfig {
  /** Number of retries after the initial attempt. 0 = explicitly no retry. Absent = use global catalog value. */
  max_retries?: number
  /** Backoff strategy. Absent = use global catalog value. */
  backoff?: 'exponential' | 'fixed'
  /** Initial retry interval in seconds. Absent = use global catalog value. */
  initial_interval?: number
  /** Maximum retry interval in seconds. Absent = use global catalog value. */
  max_interval?: number
  /** Multiplier applied to interval on each retry (exponential only). Absent = use global catalog value. */
  backoff_coefficient?: number
}

/** Engine-level settings controlling how the workflow engine runs a node. */
export interface NodeSettings {
  /** When true, downstream nodes continue executing even if this node fails. */
  continue_on_failure?: boolean
  /** Timeout in seconds. Meaning varies by node type. Falls back to the global catalog default when absent. */
  timeout?: number
  /** Per-node retry policy. Absent = use all global catalog defaults. */
  retry_policy?: RetryPolicyConfig
}

// ============================================================================
// Parameters Type Aliases (extracted from generated schemas)
// ============================================================================

/** Script node parameters */
export type ScriptConfig = WorkflowAPI.components['schemas']['script.schema_configSchema']

/** HTTP request node parameters */
export type HttpRequestConfig = WorkflowAPI.components['schemas']['http_request.schema_configSchema']

/** Agentic (AI agent) node parameters */
export type AgenticConfig = WorkflowAPI.components['schemas']['agentic.schema_configSchema']

/** AAP job template node parameters */
export type AAPJobTemplateConfig = WorkflowAPI.components['schemas']['aap_job_template.schema_configSchema']

/** AAP workflow job template node parameters */
export type AAPWorkflowJobTemplateConfig =
  WorkflowAPI.components['schemas']['aap_workflow_job_template.schema_configSchema']

/** Approval node parameters */
export type ApprovalConfig = WorkflowAPI.components['schemas']['approval.schema_configSchema']

/** Condition node parameters */
export type ConditionConfig = WorkflowAPI.components['schemas']['condition.schema_configSchema']

/** Loop node parameters (discriminated union: for_each | do_while) */
export type LoopConfig = WorkflowAPI.components['schemas']['loop.schema_configSchema']

/** Converge node parameters */
export type ConvergeConfig = WorkflowAPI.components['schemas']['converge.schema_configSchema']

// Inline type until AAP-77227 — replace with generated OpenAPI type via npm run gen
/** Switch node configuration (per-case boolean conditions with port routing) */
export interface SwitchConfig {
  cases: Array<{
    port: string
    label: string
    condition: string
  }>
  default_port?: string
}

/**
 * Wait node configuration — total duration in seconds.
 * Inline type until AAP-66091 adds WaitConfig to the OpenAPI schema.
 * Tracks: src/nexus/schemas/workflows/v2/control-nodes/wait.schema.json
 */
export type WaitConfig = {
  duration: number
}

// ============================================================================
// Activity Base Interface
// ============================================================================

/** Base properties shared by all activity types */
interface ActivityBase {
  id: string
  name?: string
  description?: string
  outputs?: Record<string, string>
  settings?: NodeSettings
  inputs?: Record<string, unknown>
  metadata?: Record<string, unknown>
  // SECURITY NOTE: Index signature allows arbitrary properties but TypedActivity interfaces
  // provide type safety for known activity types. Always use TypedActivity discriminated union
  // (ScriptActivity, HttpRequestActivity, etc.) instead of generic Activity type.
  // The index signature is kept for backward compatibility with existing code.
  [key: string]: unknown
}

// ============================================================================
// Typed Activity Interfaces (one per node type)
// ============================================================================

/** Script execution node */
export interface ScriptActivity extends ActivityBase {
  type: 'script'
  parameters: ScriptConfig & { [key: string]: unknown }
}

/** HTTP request node */
export interface HttpRequestActivity extends ActivityBase {
  type: 'http_request'
  parameters: HttpRequestConfig & { [key: string]: unknown }
}

/** AI agent node */
export interface AgenticActivity extends ActivityBase {
  type: 'agentic'
  parameters: AgenticConfig & { [key: string]: unknown }
}

/** AAP job template node */
export interface AAPJobTemplateActivity extends ActivityBase {
  type: 'aap_job_template'
  parameters: AAPJobTemplateConfig & { [key: string]: unknown }
}

/** AAP workflow job template node */
export interface AAPWorkflowJobTemplateActivity extends ActivityBase {
  type: 'aap_workflow_job_template'
  parameters: AAPWorkflowJobTemplateConfig & { [key: string]: unknown }
}

/** Approval gate node */
export interface ApprovalActivity extends ActivityBase {
  type: 'approval'
  parameters: ApprovalConfig & { [key: string]: unknown }
}

/** Conditional branch node */
export interface ConditionActivity extends ActivityBase {
  type: 'condition'
  parameters: ConditionConfig & { [key: string]: unknown }
}

/** Loop iteration node */
export interface LoopActivity extends ActivityBase {
  type: 'loop'
  parameters: LoopConfig & { [key: string]: unknown }
}

/** Parallel branch convergence node */
export interface ConvergeActivity extends ActivityBase {
  type: 'converge'
  parameters: ConvergeConfig & { [key: string]: unknown }
}

/** Multi-case branching node */
export interface SwitchActivity extends ActivityBase {
  type: 'switch'
  parameters: SwitchConfig & { [key: string]: unknown }
}

/** Wait/delay node */
export interface WaitActivity extends ActivityBase {
  type: 'wait'
  parameters: WaitConfig & { [key: string]: unknown }
}

// ============================================================================
// Activity Discriminated Union (Typed - Opt-In)
// ============================================================================

/**
 * Typed activity discriminated union - provides type safety for node parameters.
 *
 * TypeScript can narrow the parameters type based on the 'type' discriminator:
 *
 * @example
 * function processActivity(activity: TypedActivity) {
 *   if (activity.type === 'script') {
 *     // activity.parameters is now ScriptConfig
 *     const language = activity.parameters.language  // ✅ Type-safe!
 *   }
 * }
 *
 * @example
 * function getExecutor(activity: TypedActivity): string {
 *   switch (activity.type) {
 *     case 'script':
 *       return `${activity.parameters.language} script`  // ✅ parameters is ScriptConfig
 *     case 'http_request':
 *       return `HTTP ${activity.parameters.method}`  // ✅ parameters is HttpRequestConfig
 *     // ... TypeScript ensures all cases are handled
 *   }
 * }
 */
export type TypedActivity =
  | ScriptActivity
  | HttpRequestActivity
  | AgenticActivity
  | AAPJobTemplateActivity
  | AAPWorkflowJobTemplateActivity
  | ApprovalActivity
  | ConditionActivity
  | LoopActivity
  | ConvergeActivity
  | SwitchActivity
  | WaitActivity

// ============================================================================
// Activity (Loose - Backward Compatible)
// ============================================================================

/**
 * Loose activity type for backward compatibility with existing code.
 *
 * Use TypedActivity for new code to get full type safety.
 *
 * @deprecated Prefer TypedActivity for type-safe parameters access
 */
export interface Activity {
  id: string
  type: string
  name?: string
  description?: string
  parameters: Record<string, unknown>
  outputs?: Record<string, string>
  settings?: NodeSettings
  [key: string]: unknown
}

// ============================================================================
// Convenience Type Aliases
// ============================================================================

/** Executor nodes (nodes that perform work) */
export type TaskActivity =
  | ScriptActivity
  | HttpRequestActivity
  | AgenticActivity
  | AAPJobTemplateActivity
  | AAPWorkflowJobTemplateActivity
