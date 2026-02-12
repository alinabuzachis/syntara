import type { ApprovalsAPI, FilesAPI, ToolManagerAPI, WorkflowAPI } from '@ansible/nexus-contracts'
import createFetchClient from 'openapi-fetch'
import createClient from 'openapi-react-query'

const workflowFetchClient = createFetchClient<WorkflowAPI.paths>({ baseUrl: '/api/v1/' })
export const workflowClient = createClient(workflowFetchClient)

const toolManagerFetchClient = createFetchClient<ToolManagerAPI.paths>({ baseUrl: '/api/v1/tool_manager/' })
export const toolManagerClient = createClient(toolManagerFetchClient)

// Legacy clients for backward compatibility - both use the unified tool manager API
export const toolsClient = toolManagerClient
export const toolProvidersClient = toolManagerClient

const filesFetchClient = createFetchClient<FilesAPI.paths>({ baseUrl: '/api/v1/' })
export const filesClient = createClient(filesFetchClient)

const approvalsFetchClient = createFetchClient<ApprovalsAPI.paths>({ baseUrl: '/api/v1/' })
export const approvalsClient = createClient(approvalsFetchClient)
