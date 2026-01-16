import { http, HttpResponse } from 'msw'
import type * as ToolManagerAPI from '@ansible/nexus-contracts/src/tool-manager.js'
import type * as WorkflowAPI from '@ansible/nexus-contracts/src/workflow-api.js'
import type { ToolProvider, WorkflowsResponse, Tool, Execution } from '@ansible/nexus-contracts'
import { providers } from './resources/providers'
import { workflows } from './resources/workflows'
import { tools } from './resources/tools'
import { executions } from './resources/executions'
import { approvals } from './resources/approvals'

// Define response types based on API contract
type ToolsResponse = ToolManagerAPI.paths['/tools']['get']['responses']['200']['content']['application/json']
type ToolProvidersResponse = {
  resources: ToolProvider[]
  limit: number
  has_more: boolean
}
type ExecutionsResponse = WorkflowAPI.paths['/executions']['get']['responses']['200']['content']['application/json']
type ApprovalsResponse = WorkflowAPI.paths['/approvals']['get']['responses']['200']['content']['application/json']

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

// Pagination helpers
function parseCursor(cursor: string | null): number {
  if (!cursor) return 0
  try {
    const cursorData = JSON.parse(Buffer.from(cursor, 'base64').toString())
    return cursorData.index || 0
  } catch {
    return 0
  }
}

function generateCursors(startIndex: number, limit: number, totalLength: number) {
  const hasNext = startIndex + limit < totalLength
  const hasPrev = startIndex > 0
  const next = hasNext ? Buffer.from(JSON.stringify({ index: startIndex + limit })).toString('base64') : null
  const prev = hasPrev
    ? Buffer.from(JSON.stringify({ index: Math.max(0, startIndex - limit) })).toString('base64')
    : null
  return { next, prev }
}

function paginate<T>(items: T[], cursor: string | null, limit: number, includeTotal: boolean) {
  const startIndex = parseCursor(cursor)
  const paginated = items.slice(startIndex, startIndex + limit)
  const { next, prev } = generateCursors(startIndex, limit, items.length)
  return {
    resources: paginated,
    next,
    prev,
    total: includeTotal ? items.length : null,
  }
}

export const handlers = [
  http.get('/api/v1/tool_manager/tool_providers', () => {
    const body: ToolProvidersResponse = {
      resources: providers,
      limit: 20,
      has_more: false,
    }
    return HttpResponse.json(body)
  }),
  http.post('/api/v1/tool_manager/tool_providers', async (req) => {
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

  http.get('/api/v1/tool_manager/tool_providers/:provider_id', (request) => {
    const providerId = request?.params?.provider_id
    const providerList = providers

    const body = providerList.find((p) => p.id === providerId)
    if (!body) return HttpResponse.json({ error: 'Integration not found' }, { status: 404 })
    return HttpResponse.json(body)
  }),

  http.get('/api/v1/tool_manager/tools', ({ request }) => {
    const url = new URL(request.url)
    const provider_id = url.searchParams.get('provider_id')
    const cursor = url.searchParams.get('cursor')
    const limit = parseInt(url.searchParams.get('limit') || '50', 10)
    const includeTotal = url.searchParams.get('include_total') === 'true'

    const filtered = provider_id ? tools.filter((t) => t.provider_id === provider_id) : tools
    const body: ToolsResponse = paginate(filtered, cursor, limit, includeTotal)
    return HttpResponse.json(body)
  }),

  http.patch('/api/v1/tool_manager/tools/bulk_update', async (req) => {
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

  http.get('/api/v1/executions', ({ request }) => {
    const url = new URL(request.url)
    const workflow_id = url.searchParams.get('workflow_id')
    const cursor = url.searchParams.get('cursor')
    const limit = parseInt(url.searchParams.get('limit') || '50', 10)
    const includeTotal = url.searchParams.get('include_total') === 'true'

    const filtered = workflow_id ? executions.filter((e) => e.workflow_id === workflow_id) : executions
    const body: ExecutionsResponse = paginate(filtered, cursor, limit, includeTotal)
    return HttpResponse.json(body)
  }),

  http.get('/api/v1/executions/:executionId', (request) => {
    const executionId = request.params.executionId
    const body = executions.find((e) => e.id === executionId)
    if (!body) return HttpResponse.json({ error: 'Execution not found' }, { status: 404 })
    return HttpResponse.json(body)
  }),

  http.get('/api/v1/approvals', ({ request }) => {
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const execution_id = url.searchParams.get('execution_id')
    const created_at = url.searchParams.get('created_at')
    const sort = url.searchParams.get('sort')
    const cursor = url.searchParams.get('cursor')
    const limitParam = url.searchParams.get('limit')
    const includeTotal = url.searchParams.get('include_total') === 'true'
    const limit = Math.min(Math.max(1, limitParam ? parseInt(limitParam, 10) : 50), 100)

    // Filter approvals
    let filtered = approvals.filter((a) => {
      if (status && a.status !== status) return false
      if (execution_id) {
        const approvalData = a as unknown as { execution_id?: string }
        if (approvalData.execution_id !== execution_id) return false
      }
      if (created_at && a.createdAt) {
        const filterDate = new Date(created_at).toDateString()
        if (new Date(a.createdAt).toDateString() !== filterDate) return false
      }
      return true
    })

    // Sort if provided
    if (sort) {
      const isDesc = sort.startsWith('-')
      const field = isDesc ? sort.slice(1) : sort
      filtered.sort((a, b) => {
        let aVal: string | number = ''
        let bVal: string | number = ''
        if (field === 'created_at') {
          aVal = a.createdAt ? new Date(a.createdAt).getTime() : 0
          bVal = b.createdAt ? new Date(b.createdAt).getTime() : 0
        } else if (field === 'name') {
          aVal = (a as unknown as { name?: string }).name || ''
          bVal = (b as unknown as { name?: string }).name || ''
        } else if (field === 'status') {
          aVal = a.status || ''
          bVal = b.status || ''
        }
        const cmp =
          typeof aVal === 'string' && typeof bVal === 'string'
            ? aVal.localeCompare(bVal)
            : (aVal as number) - (bVal as number)
        return isDesc ? -cmp : cmp
      })
    }

    const body: ApprovalsResponse = paginate(filtered, cursor, limit, includeTotal)
    return HttpResponse.json(body)
  }),

  http.get('/api/v1/approvals/:approvalId', (request) => {
    const approvalId = request.params.approvalId
    const body = approvals.find((a) => a.id === approvalId)
    if (!body) return HttpResponse.json({ error: 'Approval not found' }, { status: 404 })
    return HttpResponse.json(body)
  }),

  http.patch('/api/v1/approvals/:approvalId', async (request) => {
    const approvalId = request.params.approvalId
    const approval = approvals.find((a) => a.id === approvalId)
    if (!approval) return HttpResponse.json({ error: 'Approval not found' }, { status: 404 })

    const body = (await request.request.json()) as {
      status: 'approved' | 'rejected' | 'cancelled'
      notes?: string | null
    }

    // Check if already decided (409 conflict)
    const approvalData = approval as unknown as {
      status?: string
      decided_by?: { id: string; name: string } | null
      decided_at?: string | null
      decision_notes?: string | null
      updatedAt?: string
    }

    if (approvalData.status && approvalData.status !== 'pending' && approvalData.status !== 'expired') {
      return HttpResponse.json({ error: 'Approval already decided or workflow cancelled' }, { status: 409 })
    }

    approvalData.status = body.status
    approvalData.decided_at = new Date().toISOString()
    approvalData.decision_notes = body.notes || null
    // Mock user - in real implementation, this would come from auth context
    approvalData.decided_by = {
      id: '770e8400-e29b-41d4-a716-446655440001',
      name: 'Current User',
    }
    approvalData.updatedAt = new Date().toISOString()

    return HttpResponse.json(approval)
  }),

  http.post('/api/v1/approvals/batch', async (request) => {
    const body = (await request.request.json()) as {
      decisions: Array<{ approval_id: string; status: 'approved' | 'rejected' | 'cancelled'; notes?: string | null }>
    }

    if (!body.decisions || body.decisions.length === 0 || body.decisions.length > 100) {
      return HttpResponse.json({ error: 'Invalid payload: decisions array must contain 1-100 items' }, { status: 400 })
    }

    const mockUser = { id: '770e8400-e29b-41d4-a716-446655440001', name: 'Current User' }
    const now = new Date().toISOString()

    const results = body.decisions.map((decision) => {
      const approval = approvals.find((a) => a.id === decision.approval_id)
      if (!approval) {
        return {
          approval_id: decision.approval_id,
          success: false,
          status: null,
          decided_at: null,
          decided_by: null,
          decision_notes: null,
          error: 'Approval not found',
        }
      }

      const data = approval as unknown as {
        status?: string
        decided_by?: { id: string; name: string } | null
        decided_at?: string | null
        decision_notes?: string | null
        updatedAt?: string
      }
      if (data.status && data.status !== 'pending' && data.status !== 'expired') {
        return {
          approval_id: decision.approval_id,
          success: false,
          status: data.status,
          decided_at: data.decided_at || null,
          decided_by: data.decided_by || null,
          decision_notes: data.decision_notes || null,
          error: 'Approval already decided or workflow cancelled',
        }
      }

      data.status = decision.status
      data.decided_at = now
      data.decision_notes = decision.notes || null
      data.decided_by = mockUser
      data.updatedAt = now

      return {
        approval_id: decision.approval_id,
        success: true,
        status: decision.status,
        decided_at: now,
        decided_by: mockUser,
        decision_notes: decision.notes || null,
        error: null,
      }
    })

    return HttpResponse.json({
      results,
      total_success: results.filter((r) => r.success).length,
      total_failed: results.filter((r) => !r.success).length,
    })
  }),
]
