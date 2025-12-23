import { http, HttpResponse } from 'msw'
import type * as ToolsAPI from '@ansible/nexus-contracts/src/tools.js'
import type { ToolProvider, WorkflowsResponse, Tool } from '@ansible/nexus-contracts'
import { providers } from './resources/providers'
import { workflows } from './resources/workflows'
import { tools } from './resources/tools'

// Define response types based on API contract
type ToolsResponse = ToolsAPI.paths['/tools']['get']['responses']['200']['content']['application/json']
type ToolProvidersResponse = {
  resources: ToolProvider[]
  limit: number
  has_more: boolean
}

const randomCharacters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
const randomCharactersLowercase = 'abcdefghijklmnopqrstuvwxyz0123456789'

export function randomString(length: number, base = randomCharacters.length, options = { isLowercase: false }): string {
  // We'll use the default for options if it's not provided, which includes isLowercase set to false
  const randomChars = options.isLowercase ? randomCharactersLowercase : randomCharacters
  if (base > randomChars.length || base <= 0) {
    base = randomChars.length
  }
  let text = ''
  for (let i = 0; i < length; i++) {
    const index = Math.floor(Math.random() * base) % base
    text += randomChars.charAt(index)
  }
  return text
}

export const handlers = [
  http.get('/api/v1/tool-providers', () => {
    const body: ToolProvidersResponse = {
      resources: providers,
      limit: 20,
      has_more: false,
    }
    return HttpResponse.json(body)
  }),
  http.post('/api/v1/tool-providers', async (req) => {
    const newToolProvider = (await req.request.json()) as ToolProvider
    newToolProvider.id = (providers.length + 1).toString()
    newToolProvider.status = 'available'
    newToolProvider.created_at = new Date().toISOString()
    newToolProvider.updated_at = newToolProvider.created_at
    const toolNumber = Math.floor(Math.random() * 10) + 1
    for (let i = 0; i < toolNumber; i++) {
      const toolName = 'Tool' + randomString(6)
      const newTool: Tool = {
        id: (tools.length + 1).toString(),
        namespaced_name: toolName,
        description: 'This is a description for ' + toolName,
        enabled: true,
        status: 'available',
        execution_count: 0,
        last_refreshed_at: new Date().toISOString(),
        provider_id: newToolProvider.id,
      }
      tools.push(newTool)
    }
    newToolProvider.tool_count = toolNumber
    providers.push(newToolProvider)
    return HttpResponse.json(newToolProvider, { status: 201 })
  }),

  http.get('/api/v1/tool-providers/:provider_id', (request) => {
    const providerId = request?.params?.provider_id
    const providerList = providers

    const body = providerList.find((p) => p.id === providerId)
    if (!body) return HttpResponse.json({ error: 'Integration not found' }, { status: 404 })
    return HttpResponse.json(body)
  }),

  http.get('/api/v1/tools', ({ request }) => {
    const url = new URL(request.url)
    const provider_id = url.searchParams.get('provider_id')
    const cursor = url.searchParams.get('cursor')
    const limitParam = url.searchParams.get('limit')
    const includeTotal = url.searchParams.get('include_total') === 'true'
    const limit = limitParam ? parseInt(limitParam, 10) : 50

    // Filter by provider_id if provided
    let filteredTools = provider_id ? tools.filter((t) => t.provider_id === provider_id) : tools

    // Calculate total if requested
    const total = includeTotal ? filteredTools.length : null

    // Parse cursor to get starting index (simple cursor implementation)
    let startIndex = 0
    if (cursor) {
      try {
        const cursorData = JSON.parse(Buffer.from(cursor, 'base64').toString())
        startIndex = cursorData.index || 0
      } catch {
        // Invalid cursor, start from beginning
        startIndex = 0
      }
    }

    // Get paginated results
    const paginatedTools = filteredTools.slice(startIndex, startIndex + limit)
    const hasNext = startIndex + limit < filteredTools.length
    const hasPrev = startIndex > 0

    // Generate cursors
    const nextCursor = hasNext ? Buffer.from(JSON.stringify({ index: startIndex + limit })).toString('base64') : null
    const prevCursor = hasPrev
      ? Buffer.from(JSON.stringify({ index: Math.max(0, startIndex - limit) })).toString('base64')
      : null

    const body: ToolsResponse = {
      resources: paginatedTools,
      next: nextCursor,
      prev: prevCursor,
      total,
    }

    return HttpResponse.json(body)
  }),

  http.patch('/api/v1/tools/bulk-update', async (req) => {
    const reqData = (await req.request.json()) as { tool_ids?: string[]; enabled?: boolean }
    if (reqData?.tool_ids && reqData?.tool_ids?.length > 0) {
      tools.forEach((tool) => {
        if (reqData?.tool_ids?.includes(tool?.id)) tool.enabled = reqData?.enabled
      })
    }
    return HttpResponse.json({}, { status: 201 })
  }),

  http.get('/api/v1/workflows', () => {
    const body: WorkflowsResponse = {
      resources: workflows,
      next: null,
      prev: null,
      total: workflows.length,
    }
    return HttpResponse.json(body)
  }),

  http.get('/api/v1/workflows/:workflowId', (request) => {
    const workflowId = request.params.workflowId
    const body = workflows.find((w) => w.id === workflowId)
    if (!body) return HttpResponse.json({ error: 'Workflow not found' }, { status: 404 })
    return HttpResponse.json(body)
  }),
]
