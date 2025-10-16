import { http, HttpResponse } from 'msw'
import type { ToolProvider } from '../client'

const providers: ToolProvider[] = [
  {
    id: '3',
    name: 'Ansible Automation Platform',
    description:
      'Ansible Automation Platform is an enterprise framework for building and operating IT automation at scale.',
    provider_type: 'ansible-automation-platform',
    configuration: {},
    status: 'available',
    enabled: true,
    created_at: '2023-10-01T12:00:00Z',
    updated_at: '2023-10-10T12:00:00Z',
    created_by: 'admin',
  },
]

export const handlers = [
  http.get('/api/tool-providers', () => {
    return HttpResponse.json({ providers })
  }),
  http.post('/api/tool-providers', async (req) => {
    const newTool = (await req.request.json()) as ToolProvider
    newTool.id = (providers.length + 1).toString()
    newTool.created_at = new Date().toISOString()
    newTool.updated_at = newTool.created_at
    providers.push(newTool)
    return HttpResponse.json(newTool, { status: 201 })
  }),
]
