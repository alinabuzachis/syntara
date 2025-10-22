import * as ToolProvidersAPI from './tool-providers.js'
import * as ToolsAPI from './tools.js'
import * as WorkflowAPI from './workflow-api.js'

export type Execution = WorkflowAPI.components['schemas']['Execution']
export type ActivityExecution = WorkflowAPI.components['schemas']['ActivityExecution']
export type Approval = WorkflowAPI.components['schemas']['Approval']
export type ExecutionStatus = WorkflowAPI.components['schemas']['ExecutionStatus']
export type ApprovalStatus = WorkflowAPI.components['schemas']['ApprovalStatus']
export type ActivityType = WorkflowAPI.components['schemas']['ActivityType']
export type Workflow = WorkflowAPI.components['schemas']['Workflow']
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
export type JoinActivity = WorkflowAPI.components['schemas']['joinActivity']
