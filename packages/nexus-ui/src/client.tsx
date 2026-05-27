import type {
  AAPAPI,
  ApprovalsAPI,
  AuditAPI,
  AuthAPI,
  CredentialsAPI,
  ExecutionsAPI,
  IdentityProvidersAPI,
  SettingsAPI,
  ToolManagerAPI,
  UsersAPI,
  WorkflowAPI,
} from '@ansible/nexus-contracts'
import createFetchClient, { type Middleware } from 'openapi-fetch'
import createClient from 'openapi-react-query'

import { useAuthStore } from './stores/useAuthStore'
import { backendOrigin } from './utils/backendUrl'

// ============================================================================
// Auth Middleware
// ============================================================================

/**
 * openapi-fetch middleware that:
 * 1. Ensures a valid access token before every request (refreshing if needed)
 * 2. Injects the Authorization header
 * 3. On 401 response: attempts a single refresh then retries the request
 */
const authMiddleware: Middleware = {
  async onRequest({ request }) {
    const store = useAuthStore.getState()

    try {
      await store.ensureValidToken()
    } catch {
      // If we can't get a valid token, let the request proceed without auth
      // The server will return 401 and onResponse will handle it
      return request
    }

    const { accessToken } = useAuthStore.getState()
    if (accessToken) {
      request.headers.set('Authorization', `Bearer ${accessToken}`)
    }

    return request
  },

  async onResponse({ request, response }) {
    // Trigger background token refresh when the token is stale (e.g. group, profile, or status changes)
    if (response.headers.get('X-Token-Stale') === 'true') {
      const store = useAuthStore.getState()
      store.refresh().catch(() => {})
    }

    if (response.status !== 401) {
      return response
    }

    // Prevent infinite retry loops: if this is already a retried request, return the 401 directly
    if (request.headers.get('X-Auth-Retry') === '1') {
      return response
    }

    // Attempt one refresh
    const store = useAuthStore.getState()
    try {
      await store.refresh()
    } catch {
      // Refresh failed — clear auth state
      store.clearAuth()
      return response
    }

    const { accessToken } = useAuthStore.getState()
    if (!accessToken) {
      return response
    }

    // Retry the original request with the new token
    const retryRequest = new Request(request, {
      headers: new Headers(request.headers),
    })
    retryRequest.headers.set('Authorization', `Bearer ${accessToken}`)
    retryRequest.headers.set('X-Auth-Retry', '1')
    // eslint-disable-next-line no-restricted-globals -- auth middleware retry with refreshed token
    return fetch(retryRequest)
  },
}

// Exported for testing
export { authMiddleware }

// ============================================================================
// API Clients
// ============================================================================

const workflowFetchClient = createFetchClient<WorkflowAPI.paths>({ baseUrl: '/api/v1/' })
workflowFetchClient.use(authMiddleware)
export { workflowFetchClient }
export const workflowClient = createClient(workflowFetchClient)

const executionsFetchClient = createFetchClient<ExecutionsAPI.paths>({ baseUrl: '/api/v1/' })
executionsFetchClient.use(authMiddleware)
export const executionsClient = createClient(executionsFetchClient)

const toolManagerFetchClient = createFetchClient<ToolManagerAPI.paths>({ baseUrl: '/api/v1/' })
toolManagerFetchClient.use(authMiddleware)
export const toolManagerClient = createClient(toolManagerFetchClient)

const approvalsFetchClient = createFetchClient<ApprovalsAPI.paths>({ baseUrl: '/api/v1/' })
approvalsFetchClient.use(authMiddleware)
export const approvalsClient = createClient(approvalsFetchClient)

const settingsFetchClient = createFetchClient<SettingsAPI.paths>({ baseUrl: '/api/v1/' })
settingsFetchClient.use(authMiddleware)
export { settingsFetchClient }
export const settingsClient = createClient(settingsFetchClient)

const identityProvidersFetchClient = createFetchClient<IdentityProvidersAPI.paths>({
  baseUrl: '/api/v1',
})
identityProvidersFetchClient.use(authMiddleware)
export const identityProvidersClient = createClient(identityProvidersFetchClient)

export const authFetchClient = createFetchClient<AuthAPI.paths>({ baseUrl: '/api/v1' })
authFetchClient.use(authMiddleware)
export const authClient = createClient(authFetchClient)

/**
 * OIDC redirect URLs — full-page navigations handled by the backend, not JSON API calls.
 * These are not in the OpenAPI contract because the browser navigates to them directly.
 */
export const OIDC_REDIRECT_URI = `${backendOrigin}/api/v1/auth/oidc/callback`
export const OIDC_AUTHORIZE_PATH = '/api/v1/auth/oidc/authorize'

const usersFetchClient = createFetchClient<UsersAPI.paths>({ baseUrl: '/api/v1' })
usersFetchClient.use(authMiddleware)
export const usersClient = createClient(usersFetchClient)

const credentialsFetchClient = createFetchClient<CredentialsAPI.paths>({ baseUrl: '/api/v1/' })
credentialsFetchClient.use(authMiddleware)
export const credentialsClient = createClient(credentialsFetchClient)

const aapFetchClient = createFetchClient<AAPAPI.paths>({ baseUrl: '/api/v1/' })
aapFetchClient.use(authMiddleware)
export const aapClient = createClient(aapFetchClient)

const auditFetchClient = createFetchClient<AuditAPI.paths>({ baseUrl: '/api/v1/' })
auditFetchClient.use(authMiddleware)
export const auditClient = createClient(auditFetchClient)
