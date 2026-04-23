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
import { credentials, credentialTypes, credentialWorkflows } from './resources/credentials'
import { providers } from './resources/providers'
import { workflows } from './resources/workflows'
import { tools } from './resources/tools'
import { executions } from './resources/executions'
import { approvals } from './resources/approvals'
import { settings, settingsCategories } from './resources/settings'
import { identityProviders, type IdentityProvider } from './resources/identityProviders'
import { users, type UserRead } from './resources/users'
import { groups, userGroupMemberships, type GroupRead } from './resources/groups'
import {
  mockProjects,
  mockPolicies,
  mockRoles,
  mockProjectRoleAssignments,
  mockProjectGroupRoleAssignments,
  mockGroupRoleAssignments,
  mockUserRoleAssignments,
  mockUsers,
  mockGroups,
  getUserName,
  getGroupName,
  getRoleName,
} from './resources/access'
import {
  organizations,
  jobTemplates,
  jobTemplateDetails,
  inventories,
  executionEnvironments,
  aapCredentials,
  instanceGroups,
} from './resources/aap'

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

/** Redact secret fields in a credential's inputs to match real API behavior */
function redactCredential(credential: (typeof credentials)[number]) {
  const credType = credentialTypes.find((t) => t.id === credential.credential_type_id)
  const fields = ((credType?.inputs as Record<string, unknown>)?.fields as { id: string; secret?: boolean }[]) ?? []
  const redactedInputs = { ...credential.inputs }
  for (const field of fields) {
    if (field.secret && field.id in redactedInputs) {
      ;(redactedInputs as Record<string, unknown>)[field.id] = '$encrypted$'
    }
  }
  return { ...credential, inputs: redactedInputs }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Validates credential_id query parameter format.
 * Returns error response if invalid UUID, null if valid or not provided.
 */
function validateCredentialId(url: URL): ReturnType<typeof HttpResponse.json> | null {
  const credentialId = url.searchParams.get('credential_id')
  if (credentialId && !UUID_REGEX.test(credentialId)) {
    return HttpResponse.json(
      {
        type: 'https://api.nexus.com/errors/validation-error',
        title: 'Validation Error',
        detail: 'credential_id must be a valid UUID',
        code: 'VALIDATION_ERROR',
      },
      { status: 422 }
    )
  }
  return null
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

  http.delete('/api/v1/tool_manager/tool_providers/:provider_id', (request) => {
    const providerId = request.params.provider_id as string
    const index = providers.findIndex((p) => p.id === providerId)
    if (index === -1) {
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
    providers.splice(index, 1)
    for (let i = tools.length - 1; i >= 0; i--) {
      if (tools[i].provider_id === providerId) tools.splice(i, 1)
    }
    return new HttpResponse(null, { status: 204 })
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

    const projectId = url.searchParams.get('project_id')

    let resources = workflows

    // Apply project filter
    if (projectId) {
      resources = resources.filter((w) => w.project_id === projectId)
    }

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
    const body = (await req.request.json()) as CreateWorkflowBody & {
      labels?: Record<string, string>
      project_id?: string
    }
    const now = new Date().toISOString()
    const workflowId = uuidv4()
    const labelRecord = body.labels ?? {}
    const projectId = typeof body.project_id === 'string' && body.project_id.length > 0 ? body.project_id : 'p-001'
    const createdWorkflow: WorkflowWithVersion & { project_id: string } = {
      id: workflowId,
      name: body.name ?? 'new-workflow',
      description: body.description ?? body.name ?? 'New workflow',
      labels: labelRecord,
      is_enabled: body.is_enabled ?? false,
      created_at: now,
      updated_at: now,
      created_by: 'user-1',
      updated_by: null,
      project_id: projectId,
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

    // Cascade: remove executions associated with the deleted workflow
    for (let i = executions.length - 1; i >= 0; i--) {
      if (executions[i].workflow_id === workflowId) {
        executions.splice(i, 1)
      }
    }

    return new HttpResponse(null, { status: 204 })
  }),

  http.get('/api/v1/executions', ({ request }) => {
    const url = new URL(request.url)
    const workflow_id = url.searchParams.get('workflow_id')
    const cursor = url.searchParams.get('cursor')
    const limit = parseInt(url.searchParams.get('limit') || '50', 10)
    const includeTotal = url.searchParams.get('include_total') === 'true'

    const project_id = url.searchParams.get('project_id')

    let filtered = workflow_id ? executions.filter((e) => e.workflow_id === workflow_id) : executions

    // Filter by project: find workflow IDs belonging to the project, then filter executions
    if (project_id) {
      const projectWorkflowIds = new Set(workflows.filter((w) => w.project_id === project_id).map((w) => w.id))
      filtered = filtered.filter((e) => e.workflow_id && projectWorkflowIds.has(e.workflow_id))
    }

    // Enrich executions with project_id from their workflow
    const workflowProjectMap = new Map(workflows.map((w) => [w.id, w.project_id]))
    const enriched = filtered.map((e) => ({
      ...e,
      project_id: e.workflow_id ? (workflowProjectMap.get(e.workflow_id) ?? null) : null,
    }))

    const body = paginate(enriched, cursor, limit, includeTotal)
    return HttpResponse.json(body)
  }),

  http.post('/api/v1/executions', async ({ request }) => {
    const body = (await request.json()) as ExecutionsAPI.components['schemas']['CreateExecutionRequest']
    const execution = {
      id: uuidv4(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      workflow_id: body.workflow_id,
      status: 'completed' as const,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      started_by: 'user-1',
      input_data: body.input_data ?? {},
    }
    executions.push(execution)
    return HttpResponse.json(execution, { status: 201 })
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
    const project_id = url.searchParams.get('project_id')
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
      if (project_id) {
        const approvalData = a as unknown as { project_id?: string | null }
        if (approvalData.project_id !== project_id) return false
      }
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

  // Auth providers (public endpoint for login page)
  http.get('/api/v1/auth/providers', () => {
    const enabled = identityProviders.filter((p) => p.enabled)
    return HttpResponse.json({
      providers: enabled.map((p) => ({
        id: p.id,
        name: p.name,
        provider_type: p.configuration?.provider_type ?? 'oidc',
      })),
    })
  }),

  // Auth login
  http.post('/api/v1/auth/login', () => {
    return HttpResponse.json({
      access_token: 'mock-access-token',
      token_type: 'bearer',
      expires_in: 3600,
    })
  }),

  // Auth refresh
  http.post('/api/v1/auth/refresh', () => {
    return HttpResponse.json({
      access_token: 'mock-access-token-refreshed',
      token_type: 'bearer',
      expires_in: 3600,
    })
  }),

  // Auth logout
  http.post('/api/v1/auth/logout', () => {
    return new HttpResponse(null, { status: 204 })
  }),

  // Current user (mock profile)
  http.get('/api/v1/auth/me', () => {
    return HttpResponse.json({
      id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      username: 'demo',
      email: 'demo@nexus.local',
      groups: ['admins', 'platform-admins', 'authenticated'],
    })
  }),

  // Identity provider handlers
  http.get('/api/v1/identity_providers', ({ request }) => {
    const url = new URL(request.url)
    const cursor = url.searchParams.get('cursor')
    const parsedLimit = Number.parseInt(url.searchParams.get('limit') ?? '20', 10)
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 20
    const includeTotal = url.searchParams.get('include_total') === 'true'
    const sort = url.searchParams.get('sort')

    let resources = [...identityProviders]

    if (sort) {
      const isDesc = sort.startsWith('-')
      const field = isDesc ? sort.slice(1) : sort
      resources.sort((a, b) => {
        let aVal = ''
        let bVal = ''
        switch (field) {
          case 'name':
            aVal = a.name ?? ''
            bVal = b.name ?? ''
            break
          case 'enabled':
            aVal = a.enabled ? 'Enabled' : 'Disabled'
            bVal = b.enabled ? 'Enabled' : 'Disabled'
            break
          case 'issuer_url':
            aVal = a.configuration?.issuer_url ?? ''
            bVal = b.configuration?.issuer_url ?? ''
            break
          case 'client_id':
            aVal = a.configuration?.client_id ?? ''
            bVal = b.configuration?.client_id ?? ''
            break
          default:
            aVal = a.name ?? ''
            bVal = b.name ?? ''
        }
        const cmp = aVal.localeCompare(bVal)
        return isDesc ? -cmp : cmp
      })
    }

    return HttpResponse.json(paginate(resources, cursor, limit, includeTotal))
  }),

  http.post('/api/v1/identity_providers', async ({ request }) => {
    const body = (await request.json()) as {
      name?: string
      description?: string
      enabled?: boolean
      configuration?: IdentityProvider['configuration']
    }

    const existing = identityProviders.find((p) => p.name?.toLowerCase() === body.name?.toLowerCase())
    if (existing) {
      return HttpResponse.json(
        {
          type: 'https://api.nexus.com/errors/provider-name-conflict',
          title: 'Provider Name Conflict',
          detail: `An identity provider named "${body.name}" already exists. Choose a different name.`,
          code: 'PROVIDER_NAME_CONFLICT',
          retryable: false,
          instance: '/api/v1/identity_providers',
        },
        { status: 409 }
      )
    }

    const now = new Date().toISOString()
    const provider: IdentityProvider = {
      id: uuidv4(),
      name: body.name,
      description: body.description,
      enabled: body.enabled ?? true,
      configuration: body.configuration,
      created_at: now,
      updated_at: now,
    }
    identityProviders.push(provider)
    return HttpResponse.json(provider, { status: 201 })
  }),

  http.get('/api/v1/identity_providers/:providerId', ({ params }) => {
    const provider = identityProviders.find((p) => p.id === params.providerId)
    if (!provider) {
      return HttpResponse.json(
        {
          type: 'https://api.nexus.com/errors/provider-not-found',
          title: 'Provider Not Found',
          detail: `Identity provider with id '${params.providerId as string}' not found`,
          code: 'PROVIDER_NOT_FOUND',
          retryable: false,
          instance: `/api/v1/identity_providers/${params.providerId as string}`,
        },
        { status: 404 }
      )
    }
    return HttpResponse.json(provider)
  }),

  http.patch('/api/v1/identity_providers/:providerId', async ({ params, request }) => {
    const provider = identityProviders.find((p) => p.id === params.providerId)
    if (!provider) {
      return HttpResponse.json(
        {
          type: 'https://api.nexus.com/errors/provider-not-found',
          title: 'Provider Not Found',
          detail: `Identity provider with id '${params.providerId as string}' not found`,
          code: 'PROVIDER_NOT_FOUND',
          retryable: false,
          instance: `/api/v1/identity_providers/${params.providerId as string}`,
        },
        { status: 404 }
      )
    }

    const body = (await request.json()) as {
      name?: string
      description?: string
      enabled?: boolean
      configuration?: IdentityProvider['configuration']
    }

    if (body.name && body.name.toLowerCase() !== provider.name?.toLowerCase()) {
      const conflict = identityProviders.find(
        (p) => p.id !== provider.id && p.name?.toLowerCase() === body.name?.toLowerCase()
      )
      if (conflict) {
        return HttpResponse.json(
          {
            type: 'https://api.nexus.com/errors/provider-name-conflict',
            title: 'Provider Name Conflict',
            detail: `An identity provider named "${body.name}" already exists. Choose a different name.`,
            code: 'PROVIDER_NAME_CONFLICT',
            retryable: false,
            instance: `/api/v1/identity_providers/${params.providerId as string}`,
          },
          { status: 409 }
        )
      }
    }

    const index = identityProviders.indexOf(provider)
    const updated: IdentityProvider = {
      ...provider,
      ...(body.name !== undefined && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.enabled !== undefined && { enabled: body.enabled }),
      ...(body.configuration !== undefined && { configuration: body.configuration }),
      updated_at: new Date().toISOString(),
    }
    identityProviders[index] = updated

    return HttpResponse.json(updated)
  }),

  http.delete('/api/v1/identity_providers/:providerId', ({ params }) => {
    const index = identityProviders.findIndex((p) => p.id === params.providerId)
    if (index === -1) {
      return HttpResponse.json(
        {
          type: 'https://api.nexus.com/errors/provider-not-found',
          title: 'Provider Not Found',
          detail: `Identity provider with id '${params.providerId as string}' not found`,
          code: 'PROVIDER_NOT_FOUND',
          retryable: false,
          instance: `/api/v1/identity_providers/${params.providerId as string}`,
        },
        { status: 404 }
      )
    }
    identityProviders.splice(index, 1)
    return new HttpResponse(null, { status: 204 })
  }),

  http.post('/api/v1/identity_providers/test', async ({ request }) => {
    const body = (await request.json()) as { configuration?: { issuer_url?: string } }
    const issuerUrl = body.configuration?.issuer_url ?? ''

    if (!issuerUrl) {
      return HttpResponse.json({ success: false, message: 'Issuer URL is required' })
    }

    return HttpResponse.json({
      success: true,
      message: `Successfully connected to ${issuerUrl}`,
      metadata: { issuer: issuerUrl },
    })
  }),

  // User handlers
  http.get('/api/v1/users', ({ request }) => {
    const url = new URL(request.url)
    const cursor = url.searchParams.get('cursor')
    const parsedLimit = Number.parseInt(url.searchParams.get('limit') ?? '20', 10)
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 20
    const includeTotal = url.searchParams.get('include_total') === 'true'
    const sort = url.searchParams.get('sort')
    const usernameContains = url.searchParams.get('username[contains]')

    let resources = [...users]

    if (usernameContains) {
      const searchTerm = usernameContains.toLowerCase()
      resources = resources.filter((u) => u.username.toLowerCase().includes(searchTerm))
    }

    const emailContains = url.searchParams.get('email[contains]')
    if (emailContains) {
      const searchTerm = emailContains.toLowerCase()
      resources = resources.filter((u) => u.email.toLowerCase().includes(searchTerm))
    }

    const fullNameContains = url.searchParams.get('full_name[contains]')
    if (fullNameContains) {
      const searchTerm = fullNameContains.toLowerCase()
      resources = resources.filter((u) => u.full_name.toLowerCase().includes(searchTerm))
    }

    if (sort) {
      const isDesc = sort.startsWith('-')
      const field = isDesc ? sort.slice(1) : sort
      resources.sort((a, b) => {
        let aVal = ''
        let bVal = ''
        switch (field) {
          case 'username':
            aVal = a.username
            bVal = b.username
            break
          case 'full_name':
            aVal = a.full_name
            bVal = b.full_name
            break
          case 'email':
            aVal = a.email
            bVal = b.email
            break
          case 'last_login':
            aVal = a.last_login ?? ''
            bVal = b.last_login ?? ''
            break
          default:
            aVal = a.username
            bVal = b.username
        }
        const cmp = aVal.localeCompare(bVal)
        return isDesc ? -cmp : cmp
      })
    }

    return HttpResponse.json(paginate(resources, cursor, limit, includeTotal))
  }),

  http.post('/api/v1/users', async ({ request }) => {
    const body = (await request.json()) as {
      username?: string
      email?: string
      full_name?: string
      password?: string
      is_active?: boolean
    }

    const existing = users.find(
      (u) =>
        u.username.toLowerCase() === body.username?.toLowerCase() || u.email.toLowerCase() === body.email?.toLowerCase()
    )
    if (existing) {
      return HttpResponse.json(
        {
          type: 'https://api.nexus.com/errors/user-conflict',
          title: 'User Conflict',
          detail: `A user with that username or email already exists.`,
          code: 'USER_CONFLICT',
          retryable: false,
          instance: '/api/v1/users',
        },
        { status: 409 }
      )
    }

    const now = new Date().toISOString()
    const newUser: UserRead = {
      id: uuidv4(),
      username: body.username ?? '',
      email: body.email ?? '',
      full_name: body.full_name ?? '',
      is_active: body.is_active ?? true,
      last_login: null,
      created_at: now,
      updated_at: now,
    }
    users.push(newUser)
    return HttpResponse.json(newUser, { status: 201 })
  }),

  http.get('/api/v1/users/:userId', ({ params }) => {
    const user = users.find((u) => u.id === params.userId)
    if (!user) {
      return HttpResponse.json(
        {
          type: 'https://api.nexus.com/errors/user-not-found',
          title: 'User Not Found',
          detail: `User with id '${params.userId as string}' not found`,
          code: 'USER_NOT_FOUND',
          retryable: false,
          instance: `/api/v1/users/${params.userId as string}`,
        },
        { status: 404 }
      )
    }
    return HttpResponse.json(user)
  }),

  http.patch('/api/v1/users/:userId', async ({ params, request }) => {
    const user = users.find((u) => u.id === params.userId)
    if (!user) {
      return HttpResponse.json(
        {
          type: 'https://api.nexus.com/errors/user-not-found',
          title: 'User Not Found',
          detail: `User with id '${params.userId as string}' not found`,
          code: 'USER_NOT_FOUND',
          retryable: false,
          instance: `/api/v1/users/${params.userId as string}`,
        },
        { status: 404 }
      )
    }

    const body = (await request.json()) as {
      full_name?: string
      email?: string
      password?: string
      is_active?: boolean
    }

    if (body.email && body.email.toLowerCase() !== user.email.toLowerCase()) {
      const conflict = users.find((u) => u.id !== user.id && u.email.toLowerCase() === body.email?.toLowerCase())
      if (conflict) {
        return HttpResponse.json(
          {
            type: 'https://api.nexus.com/errors/user-conflict',
            title: 'Email Conflict',
            detail: `A user with that email already exists.`,
            code: 'USER_CONFLICT',
            retryable: false,
            instance: `/api/v1/users/${params.userId as string}`,
          },
          { status: 409 }
        )
      }
    }

    const index = users.indexOf(user)
    const updated: UserRead = {
      ...user,
      ...(body.full_name !== undefined && { full_name: body.full_name }),
      ...(body.email !== undefined && { email: body.email }),
      ...(body.is_active !== undefined && { is_active: body.is_active }),
      updated_at: new Date().toISOString(),
    }
    users[index] = updated
    return HttpResponse.json(updated)
  }),

  http.delete('/api/v1/users/:userId', ({ params }) => {
    const index = users.findIndex((u) => u.id === params.userId)
    if (index === -1) {
      return HttpResponse.json(
        {
          type: 'https://api.nexus.com/errors/user-not-found',
          title: 'User Not Found',
          detail: `User with id '${params.userId as string}' not found`,
          code: 'USER_NOT_FOUND',
          retryable: false,
          instance: `/api/v1/users/${params.userId as string}`,
        },
        { status: 404 }
      )
    }
    users.splice(index, 1)
    return new HttpResponse(null, { status: 204 })
  }),

  http.get('/api/v1/users/:userId/groups', ({ params, request }) => {
    const user = users.find((u) => u.id === params.userId)
    if (!user) {
      return HttpResponse.json(
        {
          type: 'https://api.nexus.com/errors/user-not-found',
          title: 'User Not Found',
          detail: `User with id '${params.userId as string}' not found`,
          code: 'USER_NOT_FOUND',
          retryable: false,
          instance: `/api/v1/users/${params.userId as string}/groups`,
        },
        { status: 404 }
      )
    }

    const url = new URL(request.url)
    const cursor = url.searchParams.get('cursor')
    const parsedLimit = Number.parseInt(url.searchParams.get('limit') ?? '20', 10)
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 20

    const memberGroupIds = userGroupMemberships[user.id] ?? []
    const userGroups = groups.filter((g) => memberGroupIds.includes(g.id))

    return HttpResponse.json(paginate(userGroups, cursor, limit, false))
  }),

  http.put('/api/v1/users/:userId/groups', async ({ params, request }) => {
    const user = users.find((u) => u.id === params.userId)
    if (!user) {
      return HttpResponse.json(
        {
          type: 'https://api.nexus.com/errors/user-not-found',
          title: 'User Not Found',
          detail: `User with id '${params.userId as string}' not found`,
          code: 'USER_NOT_FOUND',
          retryable: false,
          instance: `/api/v1/users/${params.userId as string}/groups`,
        },
        { status: 404 }
      )
    }

    const body = (await request.json()) as { group_ids?: string[] }
    userGroupMemberships[user.id] = body.group_ids ?? []

    const userGroups = groups.filter((g) => (body.group_ids ?? []).includes(g.id))
    return HttpResponse.json({ resources: userGroups, next: null, prev: null })
  }),

  // Group handlers
  http.get('/api/v1/groups', ({ request }) => {
    const url = new URL(request.url)
    const cursor = url.searchParams.get('cursor')
    const parsedLimit = Number.parseInt(url.searchParams.get('limit') ?? '20', 10)
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 20
    const includeTotal = url.searchParams.get('include_total') === 'true'
    const sort = url.searchParams.get('sort')
    const nameContains = url.searchParams.get('name[contains]')

    let resources = [...groups]

    if (nameContains) {
      const searchTerm = nameContains.toLowerCase()
      resources = resources.filter((g) => (g.name ?? '').toLowerCase().includes(searchTerm))
    }

    const descContains = url.searchParams.get('description[contains]')
    if (descContains) {
      const searchTerm = descContains.toLowerCase()
      resources = resources.filter((g) => (g.description ?? '').toLowerCase().includes(searchTerm))
    }

    const createdByContains = url.searchParams.get('created_by_name[contains]')
    if (createdByContains) {
      const searchTerm = createdByContains.toLowerCase()
      resources = resources.filter((g) => {
        if (!g.created_by) return false
        const creator = users.find((u) => u.id === g.created_by)
        return creator?.username.toLowerCase().includes(searchTerm) ?? false
      })
    }

    if (sort) {
      const isDesc = sort.startsWith('-')
      const field = isDesc ? sort.slice(1) : sort
      resources.sort((a, b) => {
        let aVal = ''
        let bVal = ''
        switch (field) {
          case 'name':
            aVal = a.name ?? ''
            bVal = b.name ?? ''
            break
          case 'description':
            aVal = a.description ?? ''
            bVal = b.description ?? ''
            break
          case 'created_at':
            aVal = a.created_at ?? ''
            bVal = b.created_at ?? ''
            break
          case 'updated_at':
            aVal = a.updated_at ?? ''
            bVal = b.updated_at ?? ''
            break
          case 'created_by':
            aVal = a.created_by ?? ''
            bVal = b.created_by ?? ''
            break
          default:
            aVal = a.name ?? ''
            bVal = b.name ?? ''
        }
        const cmp = aVal.localeCompare(bVal)
        return isDesc ? -cmp : cmp
      })
    }

    return HttpResponse.json(paginate(resources, cursor, limit, includeTotal))
  }),

  http.post('/api/v1/groups', async ({ request }) => {
    const body = (await request.json()) as { name?: string; description?: string | null }

    const existing = groups.find((g) => g.name?.toLowerCase() === body.name?.toLowerCase())
    if (existing) {
      return HttpResponse.json(
        {
          type: 'https://api.nexus.com/errors/group-name-conflict',
          title: 'Group Name Conflict',
          detail: `A group named "${body.name}" already exists.`,
          code: 'GROUP_NAME_CONFLICT',
          retryable: false,
          instance: '/api/v1/groups',
        },
        { status: 409 }
      )
    }

    const now = new Date().toISOString()
    const newGroup: GroupRead = {
      id: uuidv4(),
      name: body.name ?? '',
      description: body.description ?? null,
      is_builtin: false,
      created_by: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      created_at: now,
      updated_at: now,
      source: 'local',
      member_count: 0,
    }
    groups.push(newGroup)
    return HttpResponse.json(newGroup, { status: 201 })
  }),

  http.get('/api/v1/groups/:groupId', ({ params }) => {
    const group = groups.find((g) => g.id === params.groupId)
    if (!group) {
      return HttpResponse.json(
        {
          type: 'https://api.nexus.com/errors/group-not-found',
          title: 'Group Not Found',
          detail: `Group with id '${params.groupId as string}' not found`,
          code: 'GROUP_NOT_FOUND',
          retryable: false,
          instance: `/api/v1/groups/${params.groupId as string}`,
        },
        { status: 404 }
      )
    }
    return HttpResponse.json(group)
  }),

  http.patch('/api/v1/groups/:groupId', async ({ params, request }) => {
    const group = groups.find((g) => g.id === params.groupId)
    if (!group) {
      return HttpResponse.json(
        {
          type: 'https://api.nexus.com/errors/group-not-found',
          title: 'Group Not Found',
          detail: `Group with id '${params.groupId as string}' not found`,
          code: 'GROUP_NOT_FOUND',
          retryable: false,
          instance: `/api/v1/groups/${params.groupId as string}`,
        },
        { status: 404 }
      )
    }

    const body = (await request.json()) as { name?: string; description?: string | null }

    if (body.name && body.name.toLowerCase() !== group.name?.toLowerCase()) {
      const conflict = groups.find((g) => g.id !== group.id && g.name?.toLowerCase() === body.name?.toLowerCase())
      if (conflict) {
        return HttpResponse.json(
          {
            type: 'https://api.nexus.com/errors/group-name-conflict',
            title: 'Group Name Conflict',
            detail: `A group named "${body.name}" already exists.`,
            code: 'GROUP_NAME_CONFLICT',
            retryable: false,
            instance: `/api/v1/groups/${params.groupId as string}`,
          },
          { status: 409 }
        )
      }
    }

    const index = groups.indexOf(group)
    const updated: GroupRead = {
      ...group,
      ...(body.name !== undefined && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      updated_at: new Date().toISOString(),
    }
    groups[index] = updated
    return HttpResponse.json(updated)
  }),

  http.delete('/api/v1/groups/:groupId', ({ params }) => {
    const index = groups.findIndex((g) => g.id === params.groupId)
    if (index === -1) {
      return HttpResponse.json(
        {
          type: 'https://api.nexus.com/errors/group-not-found',
          title: 'Group Not Found',
          detail: `Group with id '${params.groupId as string}' not found`,
          code: 'GROUP_NOT_FOUND',
          retryable: false,
          instance: `/api/v1/groups/${params.groupId as string}`,
        },
        { status: 404 }
      )
    }
    if (groups[index].is_builtin) {
      return HttpResponse.json({ detail: 'Cannot delete built-in group' }, { status: 403 })
    }
    groups.splice(index, 1)
    return new HttpResponse(null, { status: 204 })
  }),

  http.get('/api/v1/groups/:groupId/members', ({ params, request }) => {
    const group = groups.find((g) => g.id === params.groupId)
    if (!group) {
      return HttpResponse.json(
        {
          type: 'https://api.nexus.com/errors/group-not-found',
          title: 'Group Not Found',
          detail: `Group with id '${params.groupId as string}' not found`,
          code: 'GROUP_NOT_FOUND',
          retryable: false,
          instance: `/api/v1/groups/${params.groupId as string}/members`,
        },
        { status: 404 }
      )
    }

    const url = new URL(request.url)
    const cursor = url.searchParams.get('cursor')
    const parsedLimit = Number.parseInt(url.searchParams.get('limit') ?? '20', 10)
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 20

    const memberUserIds = Object.entries(userGroupMemberships)
      .filter(([, groupIds]) => groupIds.includes(group.id))
      .map(([userId]) => userId)
    const members = users.filter((u) => memberUserIds.includes(u.id))

    return HttpResponse.json(paginate(members, cursor, limit, false))
  }),

  http.post('/api/v1/groups/:groupId/members', async ({ params, request }) => {
    const group = groups.find((g) => g.id === params.groupId)
    if (!group) {
      return HttpResponse.json(
        {
          type: 'https://api.nexus.com/errors/group-not-found',
          title: 'Group Not Found',
          detail: `Group with id '${params.groupId as string}' not found`,
          code: 'GROUP_NOT_FOUND',
          retryable: false,
          instance: `/api/v1/groups/${params.groupId as string}/members`,
        },
        { status: 404 }
      )
    }

    const body = (await request.json()) as { user_id?: string }
    const user = users.find((u) => u.id === body.user_id)
    if (!user) {
      return HttpResponse.json(
        {
          type: 'https://api.nexus.com/errors/user-not-found',
          title: 'User Not Found',
          detail: `User with id '${body.user_id ?? ''}' not found`,
          code: 'USER_NOT_FOUND',
          retryable: false,
          instance: `/api/v1/groups/${params.groupId as string}/members`,
        },
        { status: 404 }
      )
    }

    if (!userGroupMemberships[user.id]) {
      userGroupMemberships[user.id] = []
    }
    if (userGroupMemberships[user.id].includes(group.id)) {
      return HttpResponse.json(
        {
          type: 'https://api.nexus.com/errors/member-conflict',
          title: 'Member Conflict',
          detail: 'User is already a member of this group',
          code: 'MEMBER_CONFLICT',
          retryable: false,
          instance: `/api/v1/groups/${params.groupId as string}/members`,
        },
        { status: 409 }
      )
    }
    userGroupMemberships[user.id].push(group.id)
    return HttpResponse.json({ message: 'Member added successfully' }, { status: 201 })
  }),

  http.delete('/api/v1/groups/:groupId/members/:userId', ({ params }) => {
    const group = groups.find((g) => g.id === params.groupId)
    if (!group) {
      return HttpResponse.json(
        {
          type: 'https://api.nexus.com/errors/group-not-found',
          title: 'Group Not Found',
          detail: `Group with id '${params.groupId as string}' not found`,
          code: 'GROUP_NOT_FOUND',
          retryable: false,
          instance: `/api/v1/groups/${params.groupId as string}/members/${params.userId as string}`,
        },
        { status: 404 }
      )
    }

    const userId = params.userId as string
    const memberGroupIds = userGroupMemberships[userId]
    if (!memberGroupIds || !memberGroupIds.includes(group.id)) {
      return HttpResponse.json(
        {
          type: 'https://api.nexus.com/errors/member-not-found',
          title: 'Member Not Found',
          detail: 'User is not a member of this group',
          code: 'MEMBER_NOT_FOUND',
          retryable: false,
          instance: `/api/v1/groups/${params.groupId as string}/members/${userId}`,
        },
        { status: 404 }
      )
    }
    userGroupMemberships[userId] = memberGroupIds.filter((id) => id !== group.id)
    return new HttpResponse(null, { status: 204 })
  }),

  // Credential handlers
  http.get('/api/v1/credentials', ({ request }) => {
    const url = new URL(request.url)
    const nameContains = url.searchParams.get('name[contains]')
    const cursor = url.searchParams.get('cursor')
    const parsedLimit = Number.parseInt(url.searchParams.get('limit') ?? '20', 10)
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 20
    const includeTotal = url.searchParams.get('include_total') === 'true'

    let resources = credentials

    if (nameContains) {
      const searchTerm = nameContains.toLowerCase()
      resources = resources.filter((c) => (c.name ?? '').toLowerCase().includes(searchTerm))
    }

    const credTypeId = url.searchParams.get('credential_type_id')
    if (credTypeId) {
      resources = resources.filter((c) => c.credential_type_id === credTypeId)
    }

    const projectId = url.searchParams.get('project_id')
    if (projectId) {
      resources = resources.filter((c) => c.project_id === projectId)
    }

    return HttpResponse.json(paginate(resources, cursor, limit, includeTotal))
  }),

  http.post('/api/v1/credentials', async (req) => {
    const body = (await req.request.json()) as {
      name: string
      description?: string | null
      credential_type_id: string
      inputs?: Record<string, unknown>
      project_id?: string
    }

    // Validate credential type exists
    const matchingType = credentialTypes.find((t) => t.id === body.credential_type_id)
    if (!matchingType) {
      return HttpResponse.json(
        {
          type: 'https://api.nexus.com/errors/not-found',
          title: 'Not Found',
          detail: `Credential type '${body.credential_type_id}' not found`,
          code: 'NOT_FOUND',
          retryable: false,
        },
        { status: 404 }
      )
    }

    // Validate required fields from the type schema
    const typeInputs = matchingType.inputs as Record<string, unknown>
    const requiredFields = (typeInputs?.required as string[]) ?? []
    const providedInputs = body.inputs ?? {}
    const missingFields = requiredFields.filter((field) => !(field in providedInputs) || providedInputs[field] === '')
    if (missingFields.length > 0) {
      return HttpResponse.json(
        {
          type: 'https://api.nexus.com/errors/validation-error',
          title: 'Validation Error',
          detail: `Missing required input fields: ${missingFields.join(', ')}`,
          code: 'VALIDATION_ERROR',
          retryable: false,
        },
        { status: 422 }
      )
    }

    const now = new Date().toISOString()
    const newCredential = {
      id: uuidv4(),
      name: body.name,
      description: body.description ?? null,
      credential_type_id: body.credential_type_id,
      inputs: JSON.parse(JSON.stringify(body.inputs ?? {})) as Record<string, unknown>,
      enabled: true,
      created_at: now,
      updated_at: now,
      created_by: 'user-001',
      labels: {},
      deleted_at: null,
      deleted_by: null,
      project_id: body.project_id,
    }
    credentials.push(newCredential)
    matchingType.credential_count = (matchingType.credential_count ?? 0) + 1

    return HttpResponse.json(redactCredential(newCredential), { status: 201 })
  }),

  http.get('/api/v1/credentials/:credential_id', (request) => {
    const { credential_id } = request.params as { credential_id: string }
    const credential = credentials.find((c) => c.id === credential_id)
    if (!credential) {
      return HttpResponse.json(
        { type: 'not-found', title: 'Not Found', detail: 'Credential not found', code: 'NOT_FOUND', retryable: false },
        { status: 404 }
      )
    }
    return HttpResponse.json(redactCredential(credential))
  }),

  http.patch('/api/v1/credentials/:credential_id', async (request) => {
    const { credential_id } = request.params as { credential_id: string }
    const credential = credentials.find((c) => c.id === credential_id)
    if (!credential) {
      return HttpResponse.json(
        { type: 'not-found', title: 'Not Found', detail: 'Credential not found', code: 'NOT_FOUND', retryable: false },
        { status: 404 }
      )
    }
    const { name, description, inputs, enabled } = (await request.request.json()) as {
      name?: string
      description?: string | null
      inputs?: Record<string, unknown>
      enabled?: boolean
    }
    if (name != null) credential.name = name
    if (description !== undefined) credential.description = description
    if (inputs != null) {
      // JSON round-trip strips prototype properties at all nesting levels
      const sanitized = JSON.parse(JSON.stringify(inputs)) as Record<string, unknown>
      Object.assign(credential.inputs, sanitized)
    }
    if (enabled != null) credential.enabled = enabled
    credential.updated_at = new Date().toISOString()
    return HttpResponse.json(redactCredential(credential))
  }),

  http.delete('/api/v1/credentials/:credential_id', (request) => {
    const { credential_id } = request.params as { credential_id: string }
    const index = credentials.findIndex((c) => c.id === credential_id)
    if (index === -1) {
      return HttpResponse.json(
        { type: 'not-found', title: 'Not Found', detail: 'Credential not found', code: 'NOT_FOUND', retryable: false },
        { status: 404 }
      )
    }
    credentials.splice(index, 1)
    return new HttpResponse(null, { status: 204 })
  }),

  http.get('/api/v1/credentials/:credential_id/workflows', (request) => {
    const { credential_id } = request.params as { credential_id: string }
    const credential = credentials.find((c) => c.id === credential_id)
    if (!credential) {
      return HttpResponse.json(
        { type: 'not-found', title: 'Not Found', detail: 'Credential not found', code: 'NOT_FOUND', retryable: false },
        { status: 404 }
      )
    }
    return HttpResponse.json(credentialWorkflows[credential_id] ?? [])
  }),

  http.get('/api/v1/credential_types', ({ request }) => {
    const url = new URL(request.url)
    const cursor = url.searchParams.get('cursor')
    const parsedLimit = Number.parseInt(url.searchParams.get('limit') ?? '20', 10)
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 20
    const includeTotal = url.searchParams.get('include_total') === 'true'

    return HttpResponse.json(paginate(credentialTypes, cursor, limit, includeTotal))
  }),

  http.get('/api/v1/credential_types/:credential_type_id', (request) => {
    const { credential_type_id } = request.params as { credential_type_id: string }
    const credType = credentialTypes.find((t) => t.id === credential_type_id)
    if (!credType) {
      return HttpResponse.json(
        {
          type: 'not-found',
          title: 'Not Found',
          detail: 'Credential type not found',
          code: 'NOT_FOUND',
          retryable: false,
        },
        { status: 404 }
      )
    }
    return HttpResponse.json(credType)
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

  // Settings endpoints
  http.get('/api/v1/settings/categories', () => {
    return HttpResponse.json({ results: settingsCategories })
  }),

  http.get('/api/v1/settings', ({ request }) => {
    const url = new URL(request.url)
    const category = url.searchParams.get('category')
    const group = url.searchParams.get('group')
    const cursor = url.searchParams.get('cursor')
    const parsedLimit = parseInt(url.searchParams.get('limit') || '20', 10)
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 20

    let filtered = settings
    if (category) filtered = filtered.filter((s) => s.category === category)
    if (group) filtered = filtered.filter((s) => s.group === group)

    const body = paginate(filtered, cursor, limit, false)
    return HttpResponse.json(body)
  }),

  http.get('/api/v1/settings/:key', (request) => {
    const key = request.params.key as string
    const setting = settings.find((s) => s.key === key)
    if (!setting) {
      return HttpResponse.json(
        {
          type: 'https://api.nexus.com/errors/setting-not-found',
          title: 'Setting Not Found',
          detail: `Setting with key '${key}' not found`,
          code: 'SETTING_NOT_FOUND',
          retryable: false,
          instance: `/api/v1/settings/${key}`,
        },
        { status: 404 }
      )
    }
    return HttpResponse.json(setting)
  }),

  http.patch('/api/v1/settings', async (req) => {
    const body = (await req.request.json()) as {
      updates: Array<{ key: string; value: unknown; expected_version: number }>
    }
    const updated = []

    for (const update of body.updates) {
      const setting = settings.find((s) => s.key === update.key)
      if (!setting) {
        return HttpResponse.json(
          {
            type: 'https://api.nexus.com/errors/setting-not-found',
            title: 'Setting Not Found',
            detail: `Setting with key '${update.key}' not found`,
            code: 'SETTING_NOT_FOUND',
            retryable: false,
            instance: '/api/v1/settings',
          },
          { status: 404 }
        )
      }
      if (setting.version !== update.expected_version) {
        return HttpResponse.json(
          {
            type: 'https://api.nexus.com/errors/version-conflict',
            title: 'Version Conflict',
            detail: `Setting '${update.key}' has been modified (expected v${String(update.expected_version)}, current v${String(setting.version)})`,
            code: 'VERSION_CONFLICT',
            retryable: false,
            instance: '/api/v1/settings',
          },
          { status: 409 }
        )
      }

      setting.value = update.value
      setting.effective_value = update.value
      setting.version += 1
      setting.updated_at = new Date().toISOString()
      updated.push(setting)
    }

    return HttpResponse.json(updated)
  }),

  http.patch('/api/v1/settings/:key', async (req) => {
    const key = req.params.key as string
    const setting = settings.find((s) => s.key === key)
    if (!setting) {
      return HttpResponse.json(
        {
          type: 'https://api.nexus.com/errors/setting-not-found',
          title: 'Setting Not Found',
          detail: `Setting with key '${key}' not found`,
          code: 'SETTING_NOT_FOUND',
          retryable: false,
          instance: `/api/v1/settings/${key}`,
        },
        { status: 404 }
      )
    }

    const body = (await req.request.json()) as { value: unknown; expected_version: number }
    if (setting.version !== body.expected_version) {
      return HttpResponse.json(
        {
          type: 'https://api.nexus.com/errors/version-conflict',
          title: 'Version Conflict',
          detail: `Setting '${key}' has been modified (expected v${String(body.expected_version)}, current v${String(setting.version)})`,
          code: 'VERSION_CONFLICT',
          retryable: false,
          instance: `/api/v1/settings/${key}`,
        },
        { status: 409 }
      )
    }

    setting.value = body.value
    setting.effective_value = body.value
    setting.version += 1
    setting.updated_at = new Date().toISOString()
    return HttpResponse.json(setting)
  }),

  // ── Access Management: Projects ─────────────────────────────────────────

  http.get('/api/v1/projects', () => {
    return HttpResponse.json(mockProjects)
  }),

  http.post('/api/v1/projects', async ({ request }) => {
    const body = (await request.json()) as { name: string; description?: string; labels?: Record<string, string> }
    const now = new Date().toISOString()
    const project = {
      id: uuidv4(),
      name: body.name,
      description: body.description ?? null,
      labels: body.labels ?? {},
      is_default: false,
      created_at: now,
      updated_at: now,
    }
    mockProjects.push(project)
    return HttpResponse.json(project, { status: 201 })
  }),

  http.get('/api/v1/projects/:project_id', ({ params }) => {
    const project = mockProjects.find((p) => p.id === params.project_id)
    if (!project) {
      return HttpResponse.json(
        { type: 'not-found', title: 'Not Found', detail: 'Project not found', code: 'NOT_FOUND', retryable: false },
        { status: 404 }
      )
    }
    return HttpResponse.json(project)
  }),

  http.patch('/api/v1/projects/:project_id', async ({ params, request }) => {
    const project = mockProjects.find((p) => p.id === params.project_id)
    if (!project) {
      return HttpResponse.json(
        { type: 'not-found', title: 'Not Found', detail: 'Project not found', code: 'NOT_FOUND', retryable: false },
        { status: 404 }
      )
    }
    const body = (await request.json()) as { name?: string; description?: string; labels?: Record<string, string> }
    if (body.name !== undefined) project.name = body.name
    if (body.description !== undefined) project.description = body.description
    if (body.labels !== undefined) project.labels = body.labels
    project.updated_at = new Date().toISOString()
    return HttpResponse.json(project)
  }),

  http.delete('/api/v1/projects/:project_id', ({ params }) => {
    const idx = mockProjects.findIndex((p) => p.id === params.project_id)
    if (idx === -1) {
      return HttpResponse.json(
        { type: 'not-found', title: 'Not Found', detail: 'Project not found', code: 'NOT_FOUND', retryable: false },
        { status: 404 }
      )
    }
    mockProjects.splice(idx, 1)
    return new HttpResponse(null, { status: 204 })
  }),

  // ── Access Management: Project Role Assignments ─────────────────────────

  http.get('/api/v1/projects/:project_id/role-assignments', ({ params }) => {
    const assignments = mockProjectRoleAssignments.filter((a) => a.project_id === params.project_id)
    return HttpResponse.json(assignments)
  }),

  http.post('/api/v1/projects/:project_id/role-assignments', async ({ params, request }) => {
    const body = (await request.json()) as { user_id: string; role_name: string }
    const assignment = {
      id: uuidv4(),
      user_id: body.user_id,
      username: users.find((u) => u.id === body.user_id)?.username ?? body.user_id,
      project_id: params.project_id as string,
      role_name: body.role_name,
      created_at: new Date().toISOString(),
    }
    mockProjectRoleAssignments.push(assignment)
    return HttpResponse.json(assignment, { status: 201 })
  }),

  http.delete('/api/v1/projects/:project_id/role-assignments/:assignment_id', ({ params }) => {
    const idx = mockProjectRoleAssignments.findIndex(
      (a) => a.id === params.assignment_id && a.project_id === params.project_id
    )
    if (idx === -1) {
      return HttpResponse.json(
        { type: 'not-found', title: 'Not Found', detail: 'Assignment not found', code: 'NOT_FOUND', retryable: false },
        { status: 404 }
      )
    }
    mockProjectRoleAssignments.splice(idx, 1)
    return new HttpResponse(null, { status: 204 })
  }),

  // ── Access Management: Project Group Role Assignments ───────────────────

  http.get('/api/v1/projects/:project_id/group-role-assignments', ({ params }) => {
    const assignments = mockProjectGroupRoleAssignments.filter((a) => a.project_id === params.project_id)
    return HttpResponse.json(assignments)
  }),

  http.post('/api/v1/projects/:project_id/group-role-assignments', async ({ params, request }) => {
    const body = (await request.json()) as { group_id: string; role_name: string }
    const assignment = {
      id: uuidv4(),
      group_id: body.group_id,
      group_name: groups.find((g) => g.id === body.group_id)?.name ?? body.group_id,
      project_id: params.project_id as string,
      role_name: body.role_name,
      created_at: new Date().toISOString(),
    }
    mockProjectGroupRoleAssignments.push(assignment)
    return HttpResponse.json(assignment, { status: 201 })
  }),

  http.delete('/api/v1/projects/:project_id/group-role-assignments/:assignment_id', ({ params }) => {
    const idx = mockProjectGroupRoleAssignments.findIndex(
      (a) => a.id === params.assignment_id && a.project_id === params.project_id
    )
    if (idx === -1) {
      return HttpResponse.json(
        { type: 'not-found', title: 'Not Found', detail: 'Assignment not found', code: 'NOT_FOUND', retryable: false },
        { status: 404 }
      )
    }
    mockProjectGroupRoleAssignments.splice(idx, 1)
    return new HttpResponse(null, { status: 204 })
  }),

  // ── Access Management: Project-scoped Roles (CRUD) ─────────────────────

  http.get('/api/v1/projects/:project_id/roles', ({ params, request }) => {
    const url = new URL(request.url)
    const cursor = url.searchParams.get('cursor')
    const limit = parseInt(url.searchParams.get('limit') || '50', 10)
    const includeTotal = url.searchParams.get('include_total') === 'true'

    const projectId = params.project_id as string
    const filtered = mockRoles.filter((r) => r.project_id === projectId)

    return HttpResponse.json(paginate(filtered, cursor, limit, includeTotal))
  }),

  http.post('/api/v1/projects/:project_id/roles', async ({ params, request }) => {
    const body = (await request.json()) as { name: string; description?: string; policies: string[] }
    const projectId = params.project_id as string

    if (mockRoles.some((r) => r.name === body.name && r.project_id === projectId)) {
      return HttpResponse.json(
        {
          type: 'conflict',
          title: 'Conflict',
          detail: `Role with name '${body.name}' already exists in this project`,
          code: 'ROLE_NAME_CONFLICT',
          retryable: false,
        },
        { status: 409 }
      )
    }

    const now = new Date().toISOString()
    const role = {
      id: uuidv4(),
      name: body.name,
      description: body.description ?? null,
      policies: body.policies,
      is_builtin: false,
      project_id: projectId,
      labels: {},
      created_at: now,
      updated_at: now,
    }
    mockRoles.push(role)
    return HttpResponse.json(role, { status: 201 })
  }),

  http.get('/api/v1/projects/:project_id/roles/:role_id', ({ params }) => {
    const role = mockRoles.find((r) => r.id === params.role_id && r.project_id === params.project_id)
    if (!role) {
      return HttpResponse.json(
        { type: 'not-found', title: 'Not Found', detail: 'Role not found', code: 'NOT_FOUND', retryable: false },
        { status: 404 }
      )
    }
    return HttpResponse.json(role)
  }),

  http.patch('/api/v1/projects/:project_id/roles/:role_id', async ({ params, request }) => {
    const idx = mockRoles.findIndex((r) => r.id === params.role_id && r.project_id === params.project_id)
    if (idx === -1) {
      return HttpResponse.json(
        { type: 'not-found', title: 'Not Found', detail: 'Role not found', code: 'NOT_FOUND', retryable: false },
        { status: 404 }
      )
    }
    const body = (await request.json()) as { name?: string; description?: string; policies?: string[] }
    mockRoles[idx] = {
      ...mockRoles[idx],
      ...(body.name !== undefined && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.policies !== undefined && { policies: body.policies }),
      updated_at: new Date().toISOString(),
    }
    return HttpResponse.json(mockRoles[idx])
  }),

  http.delete('/api/v1/projects/:project_id/roles/:role_id', ({ params }) => {
    const idx = mockRoles.findIndex((r) => r.id === params.role_id && r.project_id === params.project_id)
    if (idx === -1) {
      return HttpResponse.json(
        { type: 'not-found', title: 'Not Found', detail: 'Role not found', code: 'NOT_FOUND', retryable: false },
        { status: 404 }
      )
    }
    mockRoles.splice(idx, 1)
    return new HttpResponse(null, { status: 204 })
  }),

  // ── Access Management: Project-scoped Policies (CRUD) ──────────────────

  http.get('/api/v1/projects/:project_id/policies', ({ params, request }) => {
    const url = new URL(request.url)
    const cursor = url.searchParams.get('cursor')
    const limit = parseInt(url.searchParams.get('limit') || '50', 10)
    const includeTotal = url.searchParams.get('include_total') === 'true'

    const projectId = params.project_id as string
    const filtered = mockPolicies.filter((p) => p.project_id === projectId || p.project_id === null)

    return HttpResponse.json(paginate(filtered, cursor, limit, includeTotal))
  }),

  http.post('/api/v1/projects/:project_id/policies', async ({ params, request }) => {
    const body = (await request.json()) as { name: string; description?: string; statements: unknown[] }
    const projectId = params.project_id as string

    if (mockPolicies.some((p) => p.name === body.name && p.project_id === projectId)) {
      return HttpResponse.json(
        {
          type: 'conflict',
          title: 'Conflict',
          detail: `Policy with name '${body.name}' already exists in this project`,
          code: 'POLICY_NAME_CONFLICT',
          retryable: false,
        },
        { status: 409 }
      )
    }

    const now = new Date().toISOString()
    const policy = {
      id: uuidv4(),
      name: body.name,
      description: body.description ?? null,
      is_builtin: false,
      project_id: projectId,
      created_at: now,
      updated_at: now,
    }
    mockPolicies.push(policy)
    return HttpResponse.json(policy, { status: 201 })
  }),

  http.get('/api/v1/projects/:project_id/policies/:policy_id', ({ params }) => {
    const policy = mockPolicies.find(
      (p) => p.id === params.policy_id && (p.project_id === params.project_id || p.project_id === null)
    )
    if (!policy) {
      return HttpResponse.json(
        { type: 'not-found', title: 'Not Found', detail: 'Policy not found', code: 'NOT_FOUND', retryable: false },
        { status: 404 }
      )
    }
    return HttpResponse.json(policy)
  }),

  http.patch('/api/v1/projects/:project_id/policies/:policy_id', async ({ params, request }) => {
    const idx = mockPolicies.findIndex((p) => p.id === params.policy_id && p.project_id === params.project_id)
    if (idx === -1) {
      return HttpResponse.json(
        { type: 'not-found', title: 'Not Found', detail: 'Policy not found', code: 'NOT_FOUND', retryable: false },
        { status: 404 }
      )
    }
    const body = (await request.json()) as { name?: string; description?: string }
    mockPolicies[idx] = {
      ...mockPolicies[idx],
      ...(body.name !== undefined && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      updated_at: new Date().toISOString(),
    }
    return HttpResponse.json(mockPolicies[idx])
  }),

  http.delete('/api/v1/projects/:project_id/policies/:policy_id', ({ params }) => {
    const idx = mockPolicies.findIndex((p) => p.id === params.policy_id && p.project_id === params.project_id)
    if (idx === -1) {
      return HttpResponse.json(
        { type: 'not-found', title: 'Not Found', detail: 'Policy not found', code: 'NOT_FOUND', retryable: false },
        { status: 404 }
      )
    }
    mockPolicies.splice(idx, 1)
    return new HttpResponse(null, { status: 204 })
  }),

  // ── Access Management: Policies (read-only) ─────────────────────────────

  http.get('/api/v1/policies', ({ request }) => {
    const url = new URL(request.url)
    const cursor = url.searchParams.get('cursor')
    const limit = parseInt(url.searchParams.get('limit') || '50', 10)
    const includeTotal = url.searchParams.get('include_total') === 'true'
    const nameContains = url.searchParams.get('name[contains]')

    let filtered = [...mockPolicies]

    if (nameContains) {
      const term = nameContains.toLowerCase()
      filtered = filtered.filter((p) => p.name.toLowerCase().includes(term))
    }

    const descContains = url.searchParams.get('description[contains]')
    if (descContains) {
      const term = descContains.toLowerCase()
      filtered = filtered.filter((p) => (p.description ?? '').toLowerCase().includes(term))
    }

    const projectEligible = url.searchParams.get('project_eligible')
    if (projectEligible === 'true') {
      // Return only system (builtin) policies whose actions are valid for project-scoped roles
      const projectActionPrefixes = ['workflow:', 'execution:', 'approval:', 'project-role:', 'audit:']
      filtered = filtered.filter(
        (p) =>
          p.is_builtin && p.project_id === null && projectActionPrefixes.some((prefix) => p.name.startsWith(prefix))
      )
    }

    const isBuiltin = url.searchParams.get('is_builtin')
    if (isBuiltin !== null) {
      const builtin = isBuiltin === 'true'
      filtered = filtered.filter((p) => p.is_builtin === builtin)
    }

    const sort = url.searchParams.get('sort')
    if (sort) {
      const isDesc = sort.startsWith('-')
      const field = isDesc ? sort.slice(1) : sort
      filtered.sort((a, b) => {
        let cmp = 0
        switch (field) {
          case 'name':
            cmp = a.name.localeCompare(b.name)
            break
          case 'description':
            cmp = (a.description ?? '').localeCompare(b.description ?? '')
            break
          case 'is_builtin':
            cmp = Number(a.is_builtin) - Number(b.is_builtin)
            break
          default:
            cmp = a.name.localeCompare(b.name)
        }
        return isDesc ? -cmp : cmp
      })
    }

    return HttpResponse.json(paginate(filtered, cursor, limit, includeTotal))
  }),

  // ── Access Management: Roles ────────────────────────────────────────────

  http.get('/api/v1/roles', ({ request }) => {
    const url = new URL(request.url)
    const cursor = url.searchParams.get('cursor')
    const limit = parseInt(url.searchParams.get('limit') || '50', 10)
    const includeTotal = url.searchParams.get('include_total') === 'true'
    const nameContains = url.searchParams.get('name[contains]')

    let filtered = [...mockRoles]

    if (nameContains) {
      const term = nameContains.toLowerCase()
      filtered = filtered.filter((r) => r.name.toLowerCase().includes(term))
    }

    const descContains = url.searchParams.get('description[contains]')
    if (descContains) {
      const term = descContains.toLowerCase()
      filtered = filtered.filter((r) => (r.description ?? '').toLowerCase().includes(term))
    }

    const isBuiltin = url.searchParams.get('is_builtin')
    if (isBuiltin !== null) {
      const builtin = isBuiltin === 'true'
      filtered = filtered.filter((r) => r.is_builtin === builtin)
    }

    const sort = url.searchParams.get('sort')
    if (sort) {
      const isDesc = sort.startsWith('-')
      const field = isDesc ? sort.slice(1) : sort
      filtered.sort((a, b) => {
        let cmp = 0
        switch (field) {
          case 'name':
            cmp = a.name.localeCompare(b.name)
            break
          case 'is_builtin':
            cmp = Number(a.is_builtin) - Number(b.is_builtin)
            break
          default:
            cmp = a.name.localeCompare(b.name)
        }
        return isDesc ? -cmp : cmp
      })
    }

    return HttpResponse.json(paginate(filtered, cursor, limit, includeTotal))
  }),

  http.post('/api/v1/roles', async ({ request }) => {
    const body = (await request.json()) as { name: string; description?: string; policies: string[] }
    if (mockRoles.some((r) => r.name === body.name)) {
      return HttpResponse.json(
        {
          type: 'conflict',
          title: 'Conflict',
          detail: `Role with name '${body.name}' already exists`,
          code: 'ROLE_NAME_CONFLICT',
          retryable: false,
        },
        { status: 409 }
      )
    }
    const role = {
      id: uuidv4(),
      name: body.name,
      description: body.description ?? null,
      policies: body.policies,
      is_builtin: false,
      project_id: null,
      labels: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    mockRoles.push(role)
    return HttpResponse.json(role, { status: 201 })
  }),

  http.put('/api/v1/roles/:role_id', async ({ params, request }) => {
    const { role_id } = params as { role_id: string }
    const idx = mockRoles.findIndex((r) => r.id === role_id)
    if (idx === -1) {
      return HttpResponse.json({ detail: 'Role not found' }, { status: 404 })
    }
    if (mockRoles[idx].is_builtin) {
      return HttpResponse.json({ detail: 'Cannot modify built-in role' }, { status: 403 })
    }
    const body = (await request.json()) as { name?: string; description?: string; policies?: string[] }
    if (body.name && body.name !== mockRoles[idx].name && mockRoles.some((r) => r.name === body.name)) {
      return HttpResponse.json(
        {
          type: 'conflict',
          title: 'Conflict',
          detail: `Role with name '${body.name}' already exists`,
          code: 'ROLE_NAME_CONFLICT',
          retryable: false,
        },
        { status: 409 }
      )
    }
    mockRoles[idx] = {
      ...mockRoles[idx],
      ...(body.name !== undefined && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.policies !== undefined && { policies: body.policies }),
      updated_at: new Date().toISOString(),
    }
    return HttpResponse.json(mockRoles[idx])
  }),

  http.delete('/api/v1/roles/:role_id', ({ params }) => {
    const { role_id } = params as { role_id: string }
    const idx = mockRoles.findIndex((r) => r.id === role_id)
    if (idx === -1) {
      return HttpResponse.json({ detail: 'Role not found' }, { status: 404 })
    }
    if (mockRoles[idx].is_builtin) {
      return HttpResponse.json({ detail: 'Cannot delete built-in role' }, { status: 403 })
    }
    mockRoles.splice(idx, 1)
    return new HttpResponse(null, { status: 204 })
  }),

  // ── Access Management: System-level User Role Assignments ───────────────

  http.get('/api/v1/user-role-assignments', () => {
    return HttpResponse.json(mockUserRoleAssignments)
  }),

  http.post('/api/v1/user-role-assignments', async ({ request }) => {
    const body = (await request.json()) as { user_id: string; role_id: string }
    const assignment = {
      id: uuidv4(),
      user_id: body.user_id,
      username: getUserName(body.user_id),
      role_id: body.role_id,
      role_name: getRoleName(body.role_id),
      created_at: new Date().toISOString(),
    }
    mockUserRoleAssignments.push(assignment)
    return HttpResponse.json(assignment, { status: 201 })
  }),

  http.delete('/api/v1/user-role-assignments/:assignment_id', ({ params }) => {
    const idx = mockUserRoleAssignments.findIndex((a) => a.id === params.assignment_id)
    if (idx === -1) {
      return HttpResponse.json(
        { type: 'not-found', title: 'Not Found', detail: 'Assignment not found', code: 'NOT_FOUND', retryable: false },
        { status: 404 }
      )
    }
    mockUserRoleAssignments.splice(idx, 1)
    return new HttpResponse(null, { status: 204 })
  }),

  // ── Access Management: System-level Group Role Assignments ──────────────

  http.get('/api/v1/group-role-assignments', () => {
    return HttpResponse.json(mockGroupRoleAssignments)
  }),

  http.post('/api/v1/group-role-assignments', async ({ request }) => {
    const body = (await request.json()) as { group_id: string; role_id: string }
    const assignment = {
      id: uuidv4(),
      group_id: body.group_id,
      group_name: getGroupName(body.group_id),
      role_id: body.role_id,
      role_name: getRoleName(body.role_id),
      created_at: new Date().toISOString(),
    }
    mockGroupRoleAssignments.push(assignment)
    return HttpResponse.json(assignment, { status: 201 })
  }),

  http.delete('/api/v1/group-role-assignments/:assignment_id', ({ params }) => {
    const idx = mockGroupRoleAssignments.findIndex((a) => a.id === params.assignment_id)
    if (idx === -1) {
      return HttpResponse.json(
        { type: 'not-found', title: 'Not Found', detail: 'Assignment not found', code: 'NOT_FOUND', retryable: false },
        { status: 404 }
      )
    }
    mockGroupRoleAssignments.splice(idx, 1)
    return new HttpResponse(null, { status: 204 })
  }),

  // ── Access Management: All Role Assignments (unified view) ─────────────

  http.get('/api/v1/all-role-assignments', ({ request }) => {
    const url = new URL(request.url)
    const cursor = url.searchParams.get('cursor')
    const limit = parseInt(url.searchParams.get('limit') || '50', 10)
    const includeTotal = url.searchParams.get('include_total') === 'true'
    const principalType = url.searchParams.get('principal_type')
    const principalName = url.searchParams.get('principal_name')
    const roleName = url.searchParams.get('role_name')
    const projectId = url.searchParams.get('project_id')

    const userEntries = mockUserRoleAssignments.map((a) => ({
      id: a.id,
      principal_id: a.user_id,
      principal_name: a.username,
      principal_type: 'user' as const,
      role_name: a.role_name,
      project_id: null,
      project_name: null,
      created_at: a.created_at,
    }))

    const groupEntries = mockGroupRoleAssignments.map((a) => ({
      id: a.id,
      principal_id: a.group_id,
      principal_name: a.group_name,
      principal_type: 'group' as const,
      role_name: a.role_name,
      project_id: null,
      project_name: null,
      created_at: a.created_at,
    }))

    const projectUserEntries = mockProjectRoleAssignments.map((a) => ({
      id: a.id,
      principal_id: a.user_id,
      principal_name: a.username,
      principal_type: 'user' as const,
      role_name: a.role_name,
      project_id: a.project_id,
      project_name: mockProjects.find((p) => p.id === a.project_id)?.name ?? null,
      created_at: a.created_at,
    }))

    const projectGroupEntries = mockProjectGroupRoleAssignments.map((a) => ({
      id: a.id,
      principal_id: a.group_id,
      principal_name: a.group_name,
      principal_type: 'group' as const,
      role_name: a.role_name,
      project_id: a.project_id,
      project_name: mockProjects.find((p) => p.id === a.project_id)?.name ?? null,
      created_at: a.created_at,
    }))

    let all = [...userEntries, ...groupEntries, ...projectUserEntries, ...projectGroupEntries]

    if (principalType) all = all.filter((a) => a.principal_type === principalType)
    if (principalName) all = all.filter((a) => a.principal_name.includes(principalName))
    if (roleName) all = all.filter((a) => a.role_name.includes(roleName))
    if (projectId) all = all.filter((a) => a.project_id === projectId)

    return HttpResponse.json(paginate(all, cursor, limit, includeTotal))
  }),

  http.get('/api/v1/projects/:project_id/all-role-assignments', ({ params, request }) => {
    const url = new URL(request.url)
    const cursor = url.searchParams.get('cursor')
    const limit = parseInt(url.searchParams.get('limit') || '50', 10)
    const includeTotal = url.searchParams.get('include_total') === 'true'
    const principalType = url.searchParams.get('principal_type')
    const principalName = url.searchParams.get('principal_name')
    const roleName = url.searchParams.get('role_name')

    const pid = params.project_id as string

    const userEntries = mockProjectRoleAssignments
      .filter((a) => a.project_id === pid)
      .map((a) => ({
        id: a.id,
        principal_id: a.user_id,
        principal_name: a.username,
        principal_type: 'user' as const,
        role_name: a.role_name,
        project_id: a.project_id,
        project_name: mockProjects.find((p) => p.id === a.project_id)?.name ?? null,
        created_at: a.created_at,
      }))

    const groupEntries = mockProjectGroupRoleAssignments
      .filter((a) => a.project_id === pid)
      .map((a) => ({
        id: a.id,
        principal_id: a.group_id,
        principal_name: a.group_name,
        principal_type: 'group' as const,
        role_name: a.role_name,
        project_id: a.project_id,
        project_name: mockProjects.find((p) => p.id === a.project_id)?.name ?? null,
        created_at: a.created_at,
      }))

    let all = [...userEntries, ...groupEntries]

    if (principalType) all = all.filter((a) => a.principal_type === principalType)
    if (principalName) all = all.filter((a) => a.principal_name.includes(principalName))
    if (roleName) all = all.filter((a) => a.role_name.includes(roleName))

    return HttpResponse.json(paginate(all, cursor, limit, includeTotal))
  }),

  // ── Access Management: Users (for display in dropdowns) ─────────────────

  http.get('/api/v1/users', () => {
    return HttpResponse.json(mockUsers)
  }),

  // ── Access Management: Groups (for display in dropdowns) ────────────────

  http.get('/api/v1/groups', () => {
    return HttpResponse.json(mockGroups)
  }),

  // ── AAP proxy endpoints ──────────────────────────────────────────────
  http.get('*/aap/organizations', ({ request }) => {
    const url = new URL(request.url)
    const validationError = validateCredentialId(url)
    if (validationError) return validationError

    const search = url.searchParams.get('search')?.toLowerCase()

    const filtered = search ? organizations.filter((o) => o.name.toLowerCase().includes(search)) : organizations
    return HttpResponse.json({ count: filtered.length, results: filtered })
  }),

  http.get('*/aap/job-templates/:id', ({ params, request }) => {
    const url = new URL(request.url)
    const validationError = validateCredentialId(url)
    if (validationError) return validationError

    const id = Number(params.id)
    const template = jobTemplates.find((t) => t.id === id)
    if (!template) {
      return HttpResponse.json({ detail: 'Not found' }, { status: 404 })
    }
    const flags = jobTemplateDetails[id] ?? {}
    return HttpResponse.json({
      id: template.id,
      name: template.name,
      description: template.description,
      url: `https://aap.example.com/execution/templates/job-template/${id}/details`,
      ask_job_type_on_launch: false,
      ask_inventory_on_launch: false,
      ask_credential_on_launch: false,
      ask_variables_on_launch: false,
      ask_limit_on_launch: false,
      ask_tags_on_launch: false,
      ask_skip_tags_on_launch: false,
      ask_verbosity_on_launch: false,
      ask_diff_mode_on_launch: false,
      ask_forks_on_launch: false,
      ask_job_slice_count_on_launch: false,
      ask_execution_environment_on_launch: false,
      ask_instance_groups_on_launch: false,
      ask_labels_on_launch: false,
      ask_timeout_on_launch: false,
      survey_enabled: false,
      ...flags,
    })
  }),

  http.get('*/aap/job-templates', ({ request }) => {
    const url = new URL(request.url)
    const credentialId = url.searchParams.get('credential_id')
    const org = url.searchParams.get('organization')
    const search = url.searchParams.get('search')?.toLowerCase()

    const validationError = validateCredentialId(url)
    if (validationError) return validationError

    let filtered = org ? jobTemplates.filter((t) => t.organization === org) : jobTemplates
    if (search) {
      filtered = filtered.filter((t) => t.name.toLowerCase().includes(search))
    }
    return HttpResponse.json({ count: filtered.length, results: filtered })
  }),

  http.get('*/aap/inventories', ({ request }) => {
    const url = new URL(request.url)
    const credentialId = url.searchParams.get('credential_id')
    const org = url.searchParams.get('organization')
    const search = url.searchParams.get('search')?.toLowerCase()

    const validationError = validateCredentialId(url)
    if (validationError) return validationError

    let filtered = org ? inventories.filter((i) => i.organization === org) : inventories
    if (search) {
      filtered = filtered.filter((i) => i.name.toLowerCase().includes(search))
    }
    return HttpResponse.json({ count: filtered.length, results: filtered })
  }),

  http.get('*/aap/execution-environments', ({ request }) => {
    const url = new URL(request.url)
    const credentialId = url.searchParams.get('credential_id')
    const search = url.searchParams.get('search')?.toLowerCase()

    const validationError = validateCredentialId(url)
    if (validationError) return validationError

    const filtered = search
      ? executionEnvironments.filter((ee) => ee.name.toLowerCase().includes(search))
      : executionEnvironments
    return HttpResponse.json({ count: filtered.length, results: filtered })
  }),

  http.get('*/aap/credentials', ({ request }) => {
    const url = new URL(request.url)
    const credentialId = url.searchParams.get('credential_id')
    const search = url.searchParams.get('search')?.toLowerCase()

    const validationError = validateCredentialId(url)
    if (validationError) return validationError

    const filtered = search ? aapCredentials.filter((c) => c.name.toLowerCase().includes(search)) : aapCredentials
    return HttpResponse.json({ count: filtered.length, results: filtered })
  }),

  http.get('*/aap/instance-groups', ({ request }) => {
    const url = new URL(request.url)
    const credentialId = url.searchParams.get('credential_id')
    const search = url.searchParams.get('search')?.toLowerCase()

    const validationError = validateCredentialId(url)
    if (validationError) return validationError

    const filtered = search ? instanceGroups.filter((ig) => ig.name.toLowerCase().includes(search)) : instanceGroups
    return HttpResponse.json({ count: filtered.length, results: filtered })
  }),
]
