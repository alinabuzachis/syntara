/**
 * API-based resource utilities for E2E test setup/teardown.
 *
 * Uses page.request (shares the browser's auth cookies/headers) to create
 * and clean up resources via the API — faster and more reliable than
 * UI-based setup, especially for fixtures.
 */
import { type Page } from '@playwright/test'

import { appBaseUrl } from '../fixtures'

/** Get the API base URL (proxied through the UI server) */
function apiUrl(path: string): string {
  return new URL(`/api/v1${path}`, appBaseUrl).toString()
}

/** Authenticate via the API and return an access token */
async function getAuthToken(app: Page): Promise<string | null> {
  const password = process.env.NEXUS_E2E_PASSWORD
  if (!password) return null

  try {
    const resp = await app.request.post(apiUrl('/auth/login'), {
      data: { username: 'admin', password },
    })
    if (!resp.ok()) return null
    const body = (await resp.json()) as { access_token?: string }
    return body.access_token ?? null
  } catch {
    return null
  }
}

/** Make an authenticated API request */
async function apiRequest(
  app: Page,
  method: 'get' | 'post' | 'delete',
  path: string,
  options?: { data?: unknown; token?: string }
) {
  const token = options?.token ?? (await getAuthToken(app))
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  if (method === 'get') {
    return app.request.get(apiUrl(path), { headers })
  }
  if (method === 'post') {
    return app.request.post(apiUrl(path), { headers, data: options?.data })
  }
  return app.request.delete(apiUrl(path), { headers })
}

/**
 * Ensure a project exists and return its ID.
 * Tries API first; falls back gracefully when RBAC blocks creation (CI).
 */
export async function ensureProject(app: Page, name = 'default'): Promise<{ id: string; name: string } | null> {
  const password = process.env.NEXUS_E2E_PASSWORD
  if (!password) return null

  try {
    const token = await getAuthToken(app)
    if (!token) return null

    const listResp = await apiRequest(app, 'get', '/projects', { token })
    if (!listResp.ok()) return null

    const projects = (await listResp.json()) as Array<{ id: string; name: string }>
    const existing = projects.find((p) => p.name === name)
    if (existing) return existing

    const createResp = await apiRequest(app, 'post', '/projects', {
      token,
      data: { name, description: `E2E test project: ${name}` },
    })
    if (createResp.ok()) {
      return (await createResp.json()) as { id: string; name: string }
    }
    // API creation blocked (e.g. RBAC 403) — project will be created via UI
    return null
  } catch {
    return null
  }
}

/**
 * Create a credential via the API. Returns the credential ID or null.
 */
export async function createCredentialViaApi(
  app: Page,
  options: { name: string; projectId: string; typeId?: string }
): Promise<string | null> {
  try {
    const token = await getAuthToken(app)
    if (!token) return null

    const typesResp = await apiRequest(app, 'get', '/credential_types', { token })
    if (!typesResp.ok()) return null

    const types = (await typesResp.json()) as { resources?: Array<{ id: string; name: string }> }
    const targetType =
      options.typeId ?? types.resources?.find((t) => t.name.includes('Bearer'))?.id ?? types.resources?.[0]?.id
    if (!targetType) return null

    const createResp = await apiRequest(app, 'post', '/credentials', {
      token,
      data: {
        name: options.name,
        credential_type_id: targetType,
        project_id: options.projectId,
        inputs: { token: 'e2e-test-token' },
      },
    })
    if (!createResp.ok()) return null
    const cred = (await createResp.json()) as { id?: string }
    return cred.id ?? null
  } catch {
    return null
  }
}

/**
 * Delete a credential via the API (best-effort cleanup).
 */
export async function deleteCredentialViaApi(app: Page, credentialId: string): Promise<void> {
  if (app.isClosed()) return
  try {
    const token = await getAuthToken(app)
    if (token) {
      await apiRequest(app, 'delete', `/credentials/${credentialId}`, { token })
    }
  } catch {
    // Best-effort cleanup
  }
}

/**
 * List credentials by name via the authenticated API.
 * Returns matching credentials for cleanup purposes.
 */
export async function listCredentialsByName(app: Page, name: string): Promise<Array<{ id: string }>> {
  try {
    const token = await getAuthToken(app)
    if (!token) return []

    const resp = await apiRequest(app, 'get', `/credentials?name=${encodeURIComponent(name)}`, {
      token,
    })
    if (!resp.ok()) return []

    const body = (await resp.json()) as { resources?: Array<{ id: string }> }
    return body.resources ?? []
  } catch {
    return []
  }
}
