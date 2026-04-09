import { http, HttpResponse } from 'msw'
import { v4 as uuidv4 } from 'uuid'
import type * as ApprovalsAPI from '@ansible/nexus-contracts/src/approvals-api.js'
import type * as ExecutionsAPI from '@ansible/nexus-contracts/src/executions-api.js'
import type * as ToolManagerAPI from '@ansible/nexus-contracts/src/tool-manager.js'
import type * as WorkflowAPI from '@ansible/nexus-contracts/src/workflow-api.js'
import type {
  Approval,
  Tool,
  ToolProvider,
  ToolProviderCreate,
  ToolProvidersResponse,
  WorkflowWithVersion,
  WorkflowsResponse,
} from '@ansible/nexus-contracts'
import { providers } from './resources/providers'
import { workflows } from './resources/workflows'
import { tools } from './resources/tools'
import { executions } from './resources/executions'
import { approvals } from './resources/approvals'

// Define response types based on API contract
type ToolsResponse = ToolManagerAPI.paths['/tools']['get']['responses']['200']['content']['application/json']
/** Mock adds limit/has_more beyond OpenAPI ResourcesResponseBase */
type ToolProvidersListBody = ToolProvidersResponse & { limit: number; has_more: boolean }
type ExecutionsResponse = ExecutionsAPI.paths['/executions']['get']['responses']['200']['content']['application/json']
type ApprovalsResponse = ApprovalsAPI.paths['/approvals']['get']['responses']['200']['content']['application/json']
type CreateWorkflowBody = WorkflowAPI.paths['/workflows']['post']['requestBody']['content']['application/json']
type UpdateWorkflowBody =
  WorkflowAPI.paths['/workflows/{workflow_id}']['patch']['requestBody']['content']['application/json']

type MutableWorkflowWithVersion = { -readonly [K in keyof WorkflowWithVersion]: WorkflowWithVersion[K] }

/** Mock seed data may use camelCase timestamps; API uses snake_case */
type ApprovalTimestamps = Approval & { createdAt?: string; updatedAt?: string }

function approvalCreatedAt(a: Approval): string | undefined {
  const row = a as ApprovalTimestamps
  return row.created_at ?? row.createdAt
}

function matchesProviderType(provider: ToolProvider, providerType: string): boolean {
  const cfg = provider.configuration as unknown as { provider_type?: string }
  return cfg.provider_type === providerType
}

const randomCharacters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
const randomCharactersLowercase = 'abcdefghijklmnopqrstuvwxyz0123456789'

function randomIntBelow(max: number): number {
  if (max <= 0) return 0
  const limit = Math.floor(0x100000000 / max) * max
  let val: number
  do {
    const buf = new Uint32Array(1)
    crypto.getRandomValues(buf)
    val = buf[0]!
  } while (val >= limit)
  return val % max
}

/** Inclusive min, exclusive max (same as Node `randomInt(min, max)`). */
function randomIntRange(min: number, maxExclusive: number): number {
  const span = maxExclusive - min
  if (span <= 1) return min
  return min + randomIntBelow(span)
}

function base64EncodeJson(payload: unknown): string {
  const json = JSON.stringify(payload)
  const bytes = new TextEncoder().encode(json)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function base64DecodeJson(cursor: string): unknown {
  const binary = atob(cursor)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const json = new TextDecoder().decode(bytes)
  return JSON.parse(json)
}

export function randomString(length: number, base = randomCharacters.length, options = { isLowercase: false }): string {
  // We'll use the default for options if it's not provided, which includes isLowercase set to false
  const randomChars = options.isLowercase ? randomCharactersLowercase : randomCharacters
  if (base > randomChars.length || base <= 0) {
    base = randomChars.length
  }
  let text = ''
  for (let i = 0; i < length; i++) {
    const index = randomIntBelow(base)
    text += randomChars.charAt(index)
  }
  return text
}

// Pagination helpers
function parseCursor(cursor: string | null): number {
  if (!cursor) return 0
  try {
    const cursorData = base64DecodeJson(cursor) as { index?: number }
    return cursorData.index ?? 0
  } catch {
    return 0
  }
}

function generateCursors(startIndex: number, limit: number, totalLength: number) {
  const hasNext = startIndex + limit < totalLength
  const hasPrev = startIndex > 0
  const next = hasNext ? base64EncodeJson({ index: startIndex + limit }) : null
  const prev = hasPrev ? base64EncodeJson({ index: Math.max(0, startIndex - limit) }) : null
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
  http.get('/api/v1/tool_manager/tool_providers', ({ request }) => {
    const url = new URL(request.url)
    const nameContains = url.searchParams.get('name[contains]')
    const status = url.searchParams.get('status')
    const providerType = url.searchParams.get('provider_type')
    const cursor = url.searchParams.get('cursor')
    const parsedLimit = Number.parseInt(url.searchParams.get('limit') ?? '20', 10)
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 20
    const includeTotal = url.searchParams.get('include_total') === 'true'

    let resources = providers

    // Apply name filter
    if (nameContains) {
      const searchTerm = nameContains.toLowerCase()
      resources = resources.filter((p) => (p.name ?? '').toLowerCase().includes(searchTerm))
    }

    // Apply status filter
    if (status) {
      resources = resources.filter((p) => p.status === status)
    }

    // Apply provider_type filter
    if (providerType) {
      resources = resources.filter((p) => matchesProviderType(p, providerType))
    }

    // Paginate results
    const startIndex = parseCursor(cursor)
    const paginated = resources.slice(startIndex, startIndex + limit)
    const { next, prev } = generateCursors(startIndex, limit, resources.length)

    const body: ToolProvidersListBody = {
      resources: paginated,
      limit,
      has_more: !!next,
      next,
      prev,
      ...(includeTotal && { total: resources.length }),
    }
    return HttpResponse.json(body)
  }),
  http.post('/api/v1/tool_manager/tool_providers', async (req) => {
    const payload = (await req.request.json()) as ToolProviderCreate
    const now = new Date().toISOString()
    const id = (providers.length + 1).toString()
    const toolNumber = randomIntRange(1, 31)
    for (let i = 0; i < toolNumber; i++) {
      const toolName = 'Tool' + randomString(6)
      const newTool: Tool = {
        id: (tools.length + 1).toString(),
        name: toolName,
        namespaced_name: toolName,
        description: 'This is a description for ' + toolName,
        enabled: true,
        status: 'available',
        last_refreshed_at: new Date().toISOString(),
        provider_id: id,
        parameters: [],
        created_at: now,
        updated_at: now,
        created_by: 'user-1',
        deleted_at: null,
        deleted_by: null,
        updated_by: null,
        labels: {},
      }
      tools.push(newTool)
    }
    const newToolProvider = {
      id,
      name: payload.name,
      description: payload.description ?? null,
      configuration: payload.configuration as unknown as ToolProvider['configuration'],
      status: 'available' as const,
      enabled: true,
      created_at: now,
      updated_at: now,
      created_by: 'user-1',
      deleted_at: null,
      deleted_by: null,
      updated_by: null,
      labels: {},
      tool_count: toolNumber,
    } as ToolProvider
    providers.push(newToolProvider)
    return HttpResponse.json(newToolProvider, { status: 201 })
  }),

  http.get('/api/v1/tool_manager/tool_providers/:provider_id', (request) => {
    const providerId = request?.params?.provider_id
    const providerList = providers

    const body = providerList.find((p) => p.id === providerId)
    if (!body) {
      return HttpResponse.json(
        {
          type: 'https://api.nexus.com/errors/provider-not-found',
          title: 'Provider Not Found',
          detail: `Integration with id '${providerId}' not found`,
          code: 'PROVIDER_NOT_FOUND',
          retryable: false,
          instance: `/api/v1/tool_manager/tool_providers/${providerId}`,
        },
        { status: 404 }
      )
    }
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
    if (reqData?.tool_ids && reqData.tool_ids.length > 0 && typeof reqData.enabled === 'boolean') {
      const { enabled } = reqData
      tools.forEach((tool) => {
        if (reqData.tool_ids?.includes(tool.id)) tool.enabled = enabled
      })
    }
    return HttpResponse.json({}, { status: 201 })
  }),

  http.get('/api/v1/workflows', ({ request }) => {
    const url = new URL(request.url)
    const nameStartsWith = url.searchParams.get('name[starts_with]')
    const nameContains = url.searchParams.get('name[contains]')
    const isEnabled = url.searchParams.get('is_enabled')
    const cursor = url.searchParams.get('cursor')
    const parsedLimit = Number.parseInt(url.searchParams.get('limit') ?? '20', 10)
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 20
    const includeTotal = url.searchParams.get('include_total') === 'true'

    let resources = workflows

    // Apply name filters
    if (nameStartsWith) {
      const prefix = nameStartsWith.toLowerCase()
      resources = resources.filter((w) => (w.name ?? '').toLowerCase().startsWith(prefix))
    }
    if (nameContains) {
      const searchTerm = nameContains.toLowerCase()
      resources = resources.filter((w) => (w.name ?? '').toLowerCase().includes(searchTerm))
    }

    // Apply is_enabled filter
    if (isEnabled !== null) {
      const enabled = isEnabled === 'true'
      resources = resources.filter((w) => w.is_enabled === enabled)
    }

    // Paginate results
    const body: WorkflowsResponse = paginate(resources, cursor, limit, includeTotal)
    return HttpResponse.json(body)
  }),
  http.post('/api/v1/workflows', async (req) => {
    const body = (await req.request.json()) as CreateWorkflowBody
    const now = new Date().toISOString()
    const workflowId = uuidv4()
    const createdWorkflow: WorkflowWithVersion = {
      id: workflowId,
      name: body.name ?? 'new-workflow',
      description: body.description ?? body.name ?? 'New workflow',
      labels: {},
      is_enabled: body.is_enabled ?? false,
      created_at: now,
      updated_at: now,
      created_by: 'user-1',
      updated_by: null,
      version: {
        version: 1,
        schema_version: body.workflow_definition?.schema_version ?? '2.0.0',
        workflow_definition: body.workflow_definition,
        created_by: 'user-1',
        created_at: now,
        change_description: 'Initial version',
      },
    }

    workflows.push(createdWorkflow)
    return HttpResponse.json(createdWorkflow, { status: 201 })
  }),

  http.get('/api/v1/workflows/:workflowId', (request) => {
    const workflowId = request.params.workflowId
    const body = workflows.find((w) => w.id === workflowId)
    if (!body) {
      return HttpResponse.json(
        {
          type: 'https://api.nexus.com/errors/workflow-not-found',
          title: 'Workflow Not Found',
          detail: `Workflow with id '${workflowId}' not found`,
          code: 'WORKFLOW_NOT_FOUND',
          retryable: false,
          instance: `/api/v1/workflows/${workflowId}`,
        },
        { status: 404 }
      )
    }
    return HttpResponse.json(body)
  }),
  http.patch('/api/v1/workflows/:workflowId', async (request) => {
    const workflowId = request.params.workflowId
    const workflow = workflows.find((w) => w.id === workflowId)
    if (!workflow) {
      return HttpResponse.json(
        {
          type: 'https://api.nexus.com/errors/workflow-not-found',
          title: 'Workflow Not Found',
          detail: `Workflow with id '${workflowId}' not found`,
          code: 'WORKFLOW_NOT_FOUND',
          retryable: false,
          instance: `/api/v1/workflows/${workflowId}`,
        },
        { status: 404 }
      )
    }

    const body = (await request.request.json()) as UpdateWorkflowBody
    const now = new Date().toISOString()
    const nextVersion = (workflow.version?.version ?? workflow.current_version ?? 1) + 1

    const mutableWorkflow = workflow as MutableWorkflowWithVersion
    mutableWorkflow.name = body.name ?? workflow.name
    mutableWorkflow.description = body.description ?? workflow.description
    mutableWorkflow.is_enabled = body.is_enabled ?? workflow.is_enabled
    mutableWorkflow.labels = body.labels ?? workflow.labels
    mutableWorkflow.updated_at = now
    mutableWorkflow.updated_by = 'user-1'
    mutableWorkflow.current_version = nextVersion
    // Tags live only in workflow.labels (above). Keep existing definition when PATCH omits workflow_definition (e.g. details-only edit).
    const nextDefinition = body.workflow_definition ?? workflow.version?.workflow_definition
    mutableWorkflow.version = {
      version: nextVersion,
      schema_version: nextDefinition?.schema_version ?? workflow.version?.schema_version ?? '2.0.0',
      workflow_definition: nextDefinition,
      created_by: mutableWorkflow.updated_by ?? workflow.version?.created_by ?? 'user-1',
      created_at: now,
      change_description: 'Updated via mock API',
    }

    return HttpResponse.json(workflow)
  }),
  http.delete('/api/v1/workflows/:workflowId', (request) => {
    const workflowId = request.params.workflowId
    const workflowIndex = workflows.findIndex((w) => w.id === workflowId)
    if (workflowIndex === -1) {
      return HttpResponse.json(
        {
          type: 'https://api.nexus.com/errors/workflow-not-found',
          title: 'Workflow Not Found',
          detail: `Workflow with id '${workflowId}' not found`,
          code: 'WORKFLOW_NOT_FOUND',
          retryable: false,
          instance: `/api/v1/workflows/${workflowId}`,
        },
        { status: 404 }
      )
    }

    workflows.splice(workflowIndex, 1)
    return new HttpResponse(null, { status: 204 })
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
    if (!body) {
      return HttpResponse.json(
        {
          type: 'https://api.nexus.com/errors/execution-not-found',
          title: 'Execution Not Found',
          detail: `Execution with id '${executionId}' not found`,
          code: 'EXECUTION_NOT_FOUND',
          retryable: false,
          instance: `/api/v1/executions/${executionId}`,
        },
        { status: 404 }
      )
    }
    return HttpResponse.json(body)
  }),

  http.get('/api/v1/approvals', ({ request }) => {
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const execution_id = url.searchParams.get('execution_id')
    const created_at = url.searchParams.get('created_at')
    const nameContains = url.searchParams.get('name[contains]')
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
      if (created_at) {
        const ts = approvalCreatedAt(a)
        if (!ts) return false
        const filterDate = new Date(created_at).toDateString()
        if (new Date(ts).toDateString() !== filterDate) return false
      }
      if (nameContains) {
        const approvalData = a as unknown as { name?: string }
        const name = approvalData.name || ''
        if (!name.toLowerCase().includes(nameContains.toLowerCase())) return false
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
          const aTs = approvalCreatedAt(a)
          const bTs = approvalCreatedAt(b)
          aVal = aTs ? new Date(aTs).getTime() : 0
          bVal = bTs ? new Date(bTs).getTime() : 0
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
    if (!body) {
      return HttpResponse.json(
        {
          type: 'https://api.nexus.com/errors/approval-not-found',
          title: 'Approval Not Found',
          detail: `Approval with id '${approvalId}' not found`,
          code: 'APPROVAL_NOT_FOUND',
          retryable: false,
          instance: `/api/v1/approvals/${approvalId}`,
        },
        { status: 404 }
      )
    }
    return HttpResponse.json(body)
  }),

  http.patch('/api/v1/approvals/:approvalId', async (request) => {
    const approvalId = request.params.approvalId
    const approval = approvals.find((a) => a.id === approvalId)
    if (!approval) {
      return HttpResponse.json(
        {
          type: 'https://api.nexus.com/errors/approval-not-found',
          title: 'Approval Not Found',
          detail: `Approval with id '${approvalId}' not found`,
          code: 'APPROVAL_NOT_FOUND',
          retryable: false,
          instance: `/api/v1/approvals/${approvalId}`,
        },
        { status: 404 }
      )
    }

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
      return HttpResponse.json(
        {
          type: 'https://api.nexus.com/errors/approval-conflict',
          title: 'Approval Conflict',
          detail: 'Approval already decided or workflow cancelled',
          code: 'APPROVAL_CONFLICT',
          retryable: false,
          instance: `/api/v1/approvals/${approvalId}`,
        },
        { status: 409 }
      )
    }

    approvalData.status = body.status
    const decidedNow = new Date().toISOString()
    approvalData.decided_at = decidedNow
    approvalData.decision_notes = body.notes ?? null
    // Mock user - in real implementation, this would come from auth context
    approvalData.decided_by = {
      id: '770e8400-e29b-41d4-a716-446655440001',
      name: 'Current User',
    }
    approvalData.updatedAt = decidedNow
    ;(approval as { updated_at: string }).updated_at = decidedNow

    return HttpResponse.json(approval)
  }),

  http.post('/api/v1/approvals/batch', async (request) => {
    const body = (await request.request.json()) as {
      decisions: Array<{ approval_id: string; status: 'approved' | 'rejected' | 'cancelled'; notes?: string | null }>
    }

    if (!body.decisions || body.decisions.length === 0 || body.decisions.length > 100) {
      return HttpResponse.json(
        {
          type: 'https://api.nexus.com/errors/validation-error',
          title: 'Validation Error',
          detail: 'Invalid payload: decisions array must contain 1-100 items',
          code: 'VALIDATION_ERROR',
          retryable: false,
          instance: '/api/v1/approvals/batch',
        },
        { status: 400 }
      )
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
      data.decision_notes = decision.notes ?? null
      data.decided_by = mockUser
      data.updatedAt = now
      ;(approval as { updated_at: string }).updated_at = now

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

  // File upload mock handler
  http.post('/api/v1/files', async ({ request }) => {
    const formData = await request.formData()
    const files = formData.getAll('files').filter((entry): entry is File => entry instanceof File)

    const fileResponses = files.map((file) => ({
      file_id: uuidv4(),
      filename: file.name,
      size_bytes: file.size,
      mime_type: file.type || 'application/octet-stream',
      status: 'pending_conversion',
    }))

    return HttpResponse.json({
      file_ids: fileResponses.map((f) => f.file_id),
      files: fileResponses,
    })
  }),
]
