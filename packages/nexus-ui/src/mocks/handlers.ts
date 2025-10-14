import { http, HttpResponse } from 'msw'
import type { Tool } from '../routes/configuration/integrations/Integration'

const tools: Tool[] = [
  {
    id: '3',
    name: 'Ansible Automation Platform',
    description:
      'Ansible Automation Platform is an enterprise framework for building and operating IT automation at scale.',
    provider_id: 'kubernetes',
    namespaced_name: 'default',
    enabled: true,
    status: 'available',
    execution_count: 42,
    created_at: '2023-10-01T12:00:00Z',
    updated_at: '2023-10-10T12:00:00Z',
    created_by: 'admin',
  },
]

export const handlers = [
  http.get('/api/tools', () => {
    return HttpResponse.json({ tools })
  }),
  http.post('/api/tools', async (req) => {
    const newTool = (await req.request.json()) as Tool
    newTool.id = (tools.length + 1).toString()
    newTool.created_at = new Date().toISOString()
    newTool.updated_at = newTool.created_at
    tools.push(newTool)
    return HttpResponse.json(newTool, { status: 201 })
  }),
]
