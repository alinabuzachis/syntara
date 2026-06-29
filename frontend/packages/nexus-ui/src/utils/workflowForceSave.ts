import type { WorkflowAPI } from '@ansible/nexus-contracts'

import { workflowFetchClient } from '../client'

type CreateWorkflowBody = WorkflowAPI.paths['/workflows']['post']['requestBody']['content']['application/json']
type PatchWorkflowBody =
  WorkflowAPI.paths['/workflows/{workflow_id}']['patch']['requestBody']['content']['application/json']

export function forceCreateWorkflow(body: CreateWorkflowBody) {
  return workflowFetchClient.POST('/workflows', {
    body,
    params: { query: { force_save: true } },
  })
}

export function forceUpdateWorkflow(workflowId: string, body: PatchWorkflowBody) {
  return workflowFetchClient.PATCH('/workflows/{workflow_id}', {
    params: { path: { workflow_id: workflowId }, query: { force_save: true } },
    body,
  })
}
