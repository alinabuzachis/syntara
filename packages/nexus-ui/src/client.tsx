import type { WorkflowAPI } from 'nexus-contracts'
import createFetchClient from 'openapi-fetch'
import createClient from 'openapi-react-query'

export const workflowFetchClient = createFetchClient<WorkflowAPI.paths>({ baseUrl: '/api/' })
export const workflowClient = createClient(workflowFetchClient)
// const {
//   data, // only present if 2XX response
//   error, // only present if 4XX or 5XX response
// } = await workflowClient.queryOptions('get', '/workflows', {})
