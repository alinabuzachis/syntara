import type { FilesAPI, ToolProvidersAPI, ToolsAPI, WorkflowAPI } from '@ansible/nexus-contracts'
import createFetchClient from 'openapi-fetch'
import createClient from 'openapi-react-query'

const workflowFetchClient = createFetchClient<WorkflowAPI.paths>({ baseUrl: '/api/v1/' })
export const workflowClient = createClient(workflowFetchClient)

const toolsFetchClient = createFetchClient<ToolsAPI.paths>({ baseUrl: '/api/v1/' })
export const toolsClient = createClient(toolsFetchClient)

const toolProvidersFetchClient = createFetchClient<ToolProvidersAPI.paths>({ baseUrl: '/api/v1/' })
export const toolProvidersClient = createClient(toolProvidersFetchClient)

const filesFetchClient = createFetchClient<FilesAPI.paths>({ baseUrl: '/api/v1/' })
export const filesClient = createClient(filesFetchClient)
