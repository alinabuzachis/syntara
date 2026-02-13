import * as ApprovalsAPI from './approvals-api.js'
import * as ToolProvidersAPI from './tool-providers.js'
import * as ToolsAPI from './tools.js'
import * as WorkflowAPI from './workflow-api.js'

export type Execution = WorkflowAPI.components['schemas']['Execution']
export type ActivityExecution = WorkflowAPI.components['schemas']['ActivityExecution']
export type Approval = ApprovalsAPI.components['schemas']['ApprovalRequest']
export type ExecutionStatus = WorkflowAPI.components['schemas']['ExecutionStatus']
export type ApprovalStatus = ApprovalsAPI.components['schemas']['ApprovalStatus']
export type ActivityType = WorkflowAPI.components['schemas']['ActivityType']
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
export type WorkflowsResponse =
  WorkflowAPI.paths['/workflows']['get']['responses']['200']['content']['application/json']
export type WorkflowWithVersion = WorkflowAPI.components['schemas']['WorkflowWithVersion']
export type WorkflowWithVersionResponse =
  WorkflowAPI.paths['/workflows/{workflowId}']['get']['responses']['200']['content']['application/json']

export type Tool = ToolsAPI.components['schemas']['Tool']

export type ToolProvider = ToolProvidersAPI.components['schemas']['ToolProvider']
export type ToolProvidersResponse =
  ToolProvidersAPI.paths['/tool-providers']['get']['responses']['200']['content']['application/json']

export type Activity = WorkflowAPI.components['schemas']['activity']
export type ConditionActivity = WorkflowAPI.components['schemas']['conditionActivity']
export type TaskActivity = WorkflowAPI.components['schemas']['taskActivity']
export type SequenceActivity = WorkflowAPI.components['schemas']['sequenceActivity']
export type ParallelActivity = WorkflowAPI.components['schemas']['parallelActivity']
export type LoopActivity = WorkflowAPI.components['schemas']['loopActivity']
export type ConvergeActivity = WorkflowAPI.components['schemas']['convergeActivity']
