/**
 * Resource seed helpers for E2E tests running against a real backend.
 *
 * Creates integrations, workflows, executions, credentials, and identity
 * providers via API. Falls back to mock credentials (password: "mock") when
 * NEXUS_E2E_PASSWORD is not set.
 *
 * Each spec file should use a unique prefix (via buildUniqueName) to avoid
 * conflicts with parallel Playwright workers.
 */
import { type Page } from '@playwright/test'

import { apiRequest, createCredentialViaApi, deleteCredentialViaApi, ensureProject, getAuthToken } from '../utils/api'

export type SeededIntegration = {
  id: string
  name: string
}

export async function createIntegrationViaApi(
  page: Page,
  options: { name: string; token?: string }
): Promise<SeededIntegration | null> {
  try {
    const token = options.token ?? (await getAuthToken(page))
    if (!token) return null

    const resp = await apiRequest(page, 'post', '/integrations', {
      token,
      data: {
        name: options.name,
        integration_type: 'mcp_server',
        configuration: {
          integration_type: 'mcp_server',
          base_url: `https://${options.name}.example.com/api`,
        },
        scope: 'global',
      },
    })
    if (!resp.ok()) return null
    const integration = (await resp.json()) as { id: string; name: string }
    return { id: integration.id, name: integration.name }
  } catch {
    return null
  }
}

export async function deleteIntegrationViaApi(page: Page, integrationId: string): Promise<void> {
  if (page.isClosed()) return
  try {
    const token = await getAuthToken(page)
    if (token) {
      await apiRequest(page, 'delete', `/integrations/${integrationId}`, { token })
    }
  } catch {
    // Best-effort cleanup
  }
}

export type SeededWorkflow = {
  id: string
  name: string
}

export async function createWorkflowViaApi(
  page: Page,
  options: { name: string; projectId?: string; token?: string }
): Promise<SeededWorkflow | null> {
  try {
    const token = options.token ?? (await getAuthToken(page))
    if (!token) return null

    const projectId = options.projectId ?? (await ensureProject(page))?.id
    const data: Record<string, unknown> = {
      name: options.name,
      description: `E2E seed workflow: ${options.name}`,
      is_enabled: false,
      workflow_definition: {
        schema_version: '2.0.0',
        name: options.name,
        description: `E2E seed workflow: ${options.name}`,
        triggers: [
          {
            id: 'trigger_1',
            name: 'Manual trigger',
            type: 'manual_trigger',
            parameters: {},
          },
        ],
        nodes: [],
        edges: [],
      },
    }
    if (projectId) data.project_id = projectId

    const resp = await apiRequest(page, 'post', '/workflows', { token, data })
    if (!resp.ok()) return null
    const workflow = (await resp.json()) as { id: string; name: string }
    return { id: workflow.id, name: workflow.name }
  } catch {
    return null
  }
}

export async function deleteWorkflowViaApi(page: Page, workflowId: string): Promise<void> {
  if (page.isClosed()) return
  try {
    const token = await getAuthToken(page)
    if (token) {
      await apiRequest(page, 'delete', `/workflows/${workflowId}`, { token })
    }
  } catch {
    // Best-effort cleanup
  }
}

export type CreatedExecution = {
  id: string
  status: string
}

/**
 * Create an execution via POST /executions.
 *
 * Against the mock API, an optional `status` is honored so tests can seed
 * mixed statuses without changing the handler's default (`completed`).
 * The real backend ignores unknown fields and always starts executions as pending.
 */
export async function createExecutionViaApi(
  page: Page,
  options: { workflowId: string; status?: string; token?: string }
): Promise<CreatedExecution | null> {
  try {
    const token = options.token ?? (await getAuthToken(page))
    if (!token) return null

    const data: Record<string, unknown> = { workflow_id: options.workflowId }
    if (options.status) data.status = options.status

    const resp = await apiRequest(page, 'post', '/executions', { token, data })
    if (!resp.ok()) return null
    const body = (await resp.json()) as { id: string; status: string }
    return { id: body.id, status: body.status }
  } catch {
    return null
  }
}

export type SeededIdentityProvider = {
  id: string
  name: string
}

export async function createIdentityProviderViaApi(
  page: Page,
  options: { name: string; token?: string }
): Promise<SeededIdentityProvider | null> {
  try {
    const token = options.token ?? (await getAuthToken(page))
    if (!token) return null

    const resp = await apiRequest(page, 'post', '/identity_providers', {
      token,
      data: {
        name: options.name,
        description: `E2E seed IdP: ${options.name}`,
        configuration: {
          provider_type: 'oidc',
          issuer_url: `https://${options.name}.example.com`,
          client_id: 'e2e-client-id',
          client_secret: 'e2e-client-secret',
          redirect_uri: `https://${options.name}.example.com/callback`,
        },
      },
    })
    if (!resp.ok()) return null
    const idp = (await resp.json()) as { id: string; name: string }
    return { id: idp.id, name: idp.name }
  } catch {
    return null
  }
}

export async function deleteIdentityProviderViaApi(page: Page, idpId: string): Promise<void> {
  if (page.isClosed()) return
  try {
    const token = await getAuthToken(page)
    if (token) {
      await apiRequest(page, 'delete', `/identity_providers/${idpId}`, { token })
    }
  } catch {
    // Best-effort cleanup
  }
}

/** Re-export credential helpers from utils/api for convenience. */
export type SeededCredential = {
  id: string
  name: string
}

export async function createCredentialSeed(
  page: Page,
  options: { name: string; projectId?: string; token?: string }
): Promise<SeededCredential | null> {
  try {
    const projectId = options.projectId ?? (await ensureProject(page))?.id
    if (!projectId) return null

    const id = await createCredentialViaApi(page, { name: options.name, projectId })
    if (!id) return null
    return { id, name: options.name }
  } catch {
    return null
  }
}

export { deleteCredentialViaApi }
