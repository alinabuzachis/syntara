import { http, HttpResponse } from 'msw'
import type { ToolProvider, ToolProvidersResponse, WorkflowsResponse } from '../client'
import { providers } from './resources/providers'
import { workflows } from './resources/workflows'

export const handlers = [
  http.get('/api/tool-providers', () => {
    const body: ToolProvidersResponse = {
      providers,
      limit: 20,
      has_more: false,
    }
    return HttpResponse.json(body)
  }),
  http.post('/api/tool-providers', async (req) => {
    const newTool = (await req.request.json()) as ToolProvider
    newTool.id = (providers.length + 1).toString()
    newTool.created_at = new Date().toISOString()
    newTool.updated_at = newTool.created_at
    providers.push(newTool)
    return HttpResponse.json(newTool, { status: 201 })
  }),

  http.get('/api/workflows', () => {
    const body: WorkflowsResponse = { workflows }
    return HttpResponse.json(body)
  }),

  http.get('/api/workflows/:workflowId', (request) => {
    const workflowId = request.params.workflowId
    const body = workflows.find((w) => w.id === workflowId)
    if (!body) return HttpResponse.json({ error: 'Workflow not found' }, { status: 404 })
    return HttpResponse.json(body)
  }),
]
