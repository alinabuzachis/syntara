import * as ActivityTypesAPI from './activity-types-api.js'
import * as ApprovalsAPI from './approvals-api.js'
import * as ExecutionsAPI from './executions-api.js'
import * as ToolManagerAPI from './tool-manager.js'
import * as WorkflowAPI from './workflow-api.js'

export type Execution = ExecutionsAPI.components['schemas']['Execution']
export type ActivityExecution = ExecutionsAPI.components['schemas']['ActivityExecution']
export type Approval = ApprovalsAPI.components['schemas']['ApprovalRequest']
export type ExecutionStatus = ExecutionsAPI.components['schemas']['ExecutionStatus']
export type ApprovalStatus = ApprovalsAPI.components['schemas']['ApprovalStatus']
export type ActivityType = ActivityTypesAPI.components['schemas']['ActivityType']
export type Workflow = WorkflowAPI.components['schemas']['Workflow']

/**
 * Constants for activity type discriminators
 * Use these constants instead of string literals when comparing activity.type values
 */
export const ActivityTypeEnum = {
  TASK: 'task',
  PARALLEL: 'parallel',
  SEQUENCE: 'sequence',
  CONDITION: 'condition',
  LOOP: 'loop',
  CONVERGE: 'converge',
  APPROVAL: 'approval',
} as const

/**
 * Constants for trigger type discriminators
 * Use these constants instead of string literals when comparing trigger.type values
 */
export const TriggerTypeEnum = {
  MANUAL: 'manual',
  SCHEDULED: 'scheduled',
  EVENT: 'event',
} as const

/**
 * Constants for task executor types
 * Use these constants instead of string literals when comparing task.executor values
 */
export const ExecutorTypeEnum = {
  SCRIPT: 'script',
  API: 'api',
  AGENTIC: 'agentic',
  CONNECTOR: 'connector',
  AAP_JOB_TEMPLATE: 'aap_job_template',
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
  // Target handles
  TARGET: 'target',
  END: 'end',
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
export type WorkflowsResponse =
  WorkflowAPI.paths['/workflows']['get']['responses']['200']['content']['application/json']
export type WorkflowWithVersion = WorkflowAPI.components['schemas']['WorkflowWithVersion']
export type WorkflowWithVersionResponse =
  WorkflowAPI.paths['/workflows/{workflow_id}']['get']['responses']['200']['content']['application/json']

export type Tool = ToolManagerAPI.components['schemas']['ToolWithParameters']

export type ToolProvider = ToolManagerAPI.components['schemas']['ToolProviderWithConfiguration']
export type ToolProviderCreate = ToolManagerAPI.components['schemas']['ToolProviderCreate']
export type ToolProvidersResponse =
  ToolManagerAPI.paths['/tool_providers']['get']['responses']['200']['content']['application/json']

export type Activity = WorkflowAPI.components['schemas']['activity']
export type ConditionActivity = WorkflowAPI.components['schemas']['conditionActivity']
export type TaskActivity = WorkflowAPI.components['schemas']['taskActivity']
export type SequenceActivity = WorkflowAPI.components['schemas']['sequenceActivity']
export type ParallelActivity = WorkflowAPI.components['schemas']['parallelActivity']
export type LoopActivity = WorkflowAPI.components['schemas']['loopActivity']
export type ConvergeActivity = WorkflowAPI.components['schemas']['convergeActivity']
