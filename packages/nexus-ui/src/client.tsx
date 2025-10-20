import type { ToolProvidersAPI, ToolsAPI, WorkflowAPI } from '@ansible/nexus-contracts'
import createFetchClient from 'openapi-fetch'
import createClient from 'openapi-react-query'

const workflowFetchClient = createFetchClient<WorkflowAPI.paths>({ baseUrl: '/api/' })
export const workflowClient = createClient(workflowFetchClient)

const toolsFetchClient = createFetchClient<ToolsAPI.paths>({ baseUrl: '/api/' })
export const toolsClient = createClient(toolsFetchClient)

const toolProvidersFetchClient = createFetchClient<ToolProvidersAPI.paths>({ baseUrl: '/api/' })
export const toolProvidersClient = createClient(toolProvidersFetchClient)
