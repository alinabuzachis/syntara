import type { Tools, WorkflowAPI } from 'nexus-contracts'
import createFetchClient from 'openapi-fetch'
import createClient from 'openapi-react-query'

const workflowFetchClient = createFetchClient<WorkflowAPI.paths>({ baseUrl: '/api/' })
export const workflowClient = createClient(workflowFetchClient)

const toolsFetchClient = createFetchClient<Tools.paths>({ baseUrl: '/api/' })
export const toolsClient = createClient(toolsFetchClient)
