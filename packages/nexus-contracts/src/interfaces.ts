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

/**
 * Script language type derived from the API contract.
 * This ensures the UI stays in sync with backend-supported languages.
 */
export type ScriptLanguage = WorkflowAPI.components['schemas']['scriptTask']['config']['language']

/**
 * Script task type derived from the API contract.
 */
export type ScriptTask = WorkflowAPI.components['schemas']['scriptTask']

/**
 * HTTP method type derived from the API contract.
 */
export type HttpMethod = WorkflowAPI.components['schemas']['apiTask']['config']['method']

/**
 * API authentication type derived from the API contract.
 */
export type ApiAuthenticationType = NonNullable<
  WorkflowAPI.components['schemas']['apiTask']['config']['authentication']
>['type']

/**
 * API task type derived from the API contract.
 */
export type ApiTask = WorkflowAPI.components['schemas']['apiTask']

/**
 * Agentic task type derived from the API contract.
 */
export type AgenticTask = WorkflowAPI.components['schemas']['agenticTask']

/**
 * Connector task type derived from the API contract.
 */
export type ConnectorTask = WorkflowAPI.components['schemas']['connectorTask']

/**
 * Task definition union type derived from the API contract.
 */
export type TaskDefinition = WorkflowAPI.components['schemas']['taskDefinition']
