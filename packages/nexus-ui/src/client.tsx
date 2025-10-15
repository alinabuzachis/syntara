import type { ToolProviders, Tools, WorkflowAPI } from 'nexus-contracts'
import createFetchClient from 'openapi-fetch'
import createClient from 'openapi-react-query'

const workflowFetchClient = createFetchClient<WorkflowAPI.paths>({ baseUrl: '/api/' })
export const workflowClient = createClient(workflowFetchClient)
export type Workflow = WorkflowAPI.components['schemas']['Workflow']
export type WorkflowWithVersion = WorkflowAPI.components['schemas']['WorkflowWithVersion']
export type Execution = WorkflowAPI.components['schemas']['Execution']
export type ActivityExecution = WorkflowAPI.components['schemas']['ActivityExecution']
export type Approval = WorkflowAPI.components['schemas']['Approval']
export type ExecutionStatus = WorkflowAPI.components['schemas']['ExecutionStatus']
export type ApprovalStatus = WorkflowAPI.components['schemas']['ApprovalStatus']
export type ActivityType = WorkflowAPI.components['schemas']['ActivityType']

const toolsFetchClient = createFetchClient<Tools.paths>({ baseUrl: '/api/' })
export const toolsClient = createClient(toolsFetchClient)
export type Tool = Tools.components['schemas']['Tool']

const toolProvidersFetchClient = createFetchClient<ToolProviders.paths>({ baseUrl: '/api/' })
export const toolProvidersClient = createClient(toolProvidersFetchClient)
export type ToolProvider = ToolProviders.components['schemas']['ToolProvider']
