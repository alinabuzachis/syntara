/**
 * Auth Store
 *
 * Zustand store managing JWT access token lifecycle.
 * - Access token stored in memory only (never localStorage/sessionStorage)
 * - Refresh via HttpOnly cookie `ao_refresh_token` (managed by backend)
 */

import { create } from 'zustand'

// ============================================================================
// Types
// ============================================================================

type LoginResponse = {
  access_token: string
  token_type: string
  expires_in: number
}

type AuthState = {
  accessToken: string | null
  expiresAt: number | null
  isAuthenticated: boolean
  isRefreshing: boolean
  error: string | null
  logoutCount: number
  username: string | null
}

type LoginCredentials = {
  username: string
  password: string
}

type AuthActions = {
  login: (credentials: LoginCredentials) => Promise<void>
  refresh: () => Promise<void>
  logout: () => Promise<void>
  ensureValidToken: () => Promise<void>
  clearAuth: () => void
  reset: () => void
}

type AuthStore = AuthState & AuthActions

// ============================================================================
// Constants
// ============================================================================

const AUTH_LOGIN_URL = '/api/v1/auth/login'
const AUTH_REFRESH_URL = '/api/v1/auth/refresh'
const AUTH_LOGOUT_URL = '/api/v1/auth/logout'

/** Refresh the token 30 seconds before it actually expires */
const EXPIRY_BUFFER_MS = 30_000

const INITIAL_STATE: AuthState = {
  accessToken: null,
  expiresAt: null,
  isAuthenticated: false,
  isRefreshing: false,
  error: null,
  logoutCount: 0,
  username: null,
}

// ============================================================================
// Helpers
// ============================================================================

type LogoutResponse = {
  error: Error | null
  /** URL to redirect the browser to for RP-initiated IdP logout. */
  redirectUrl?: string
  /** User-facing error from the backend when IdP logout fails. */
  authError?: string
}

/**
 * Revoke the session server-side via POST to the logout endpoint.
 *
 * The backend always returns JSON. When RP-initiated logout is active and
 * the IdP's end_session_endpoint is resolvable, the response includes a
 * `redirect_url` that the caller should navigate to via
 * `window.location.href` so the browser sends first-party IdP cookies.
 */
async function revokeServerSession(accessToken: string | null): Promise<LogoutResponse> {
  try {
    const logoutUrl = new URL(AUTH_LOGOUT_URL, window.location.origin)
    logoutUrl.searchParams.set('post_logout_redirect_uri', `${window.location.origin}/`)

    const response = await fetch(logoutUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      credentials: 'include',
    })

    if (!response.ok) {
      const text = await response.text()
      let detail = `Sign out failed (${response.status})`
      try {
        const parsed: Record<string, unknown> = JSON.parse(text) as Record<string, unknown>
        const msg = parsed.detail ?? parsed.message
        if (typeof msg === 'string') detail = msg
      } catch {
        if (text) detail = text
      }
      return { error: new Error(detail) }
    }

    // Parse optional redirect_url and auth_error from the response body.
    let redirectUrl: string | undefined
    let authError: string | undefined
    try {
      const body: Record<string, unknown> = (await response.json()) as Record<string, unknown>
      if (typeof body.redirect_url === 'string') {
        redirectUrl = body.redirect_url
      }
      if (typeof body.auth_error === 'string') {
        authError = body.auth_error
      }
    } catch {
      // Empty or non-JSON body — no redirect needed.
    }

    return { error: null, redirectUrl, authError }
  } catch (err) {
    return { error: err instanceof Error ? err : new Error(String(err)) }
  }
}

function isTokenExpired(expiresAt: number | null): boolean {
  if (expiresAt === null) return true
  return Date.now() >= expiresAt - EXPIRY_BUFFER_MS
}

async function postAuth(url: string, body?: object): Promise<LoginResponse> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // ensure HttpOnly cookies are sent
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  if (!response.ok) {
    const text = await response.text()
    let detail = text
    try {
      const parsed: Record<string, unknown> = JSON.parse(text) as Record<string, unknown>
      const msg = parsed.detail ?? parsed.message
      if (typeof msg === 'string') detail = msg
    } catch {
      // use raw text
    }
    throw new Error(detail)
  }

  return (await response.json()) as LoginResponse
}

function parseUsernameFromJwt(token: string): string | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const decoded = JSON.parse(atob(padded)) as { preferred_username?: string }
    return decoded.preferred_username ?? null
  } catch {
    return null
  }
}

function applyTokenResponse(set: (partial: Partial<AuthState>) => void, data: LoginResponse): void {
  set({
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    isAuthenticated: true,
    isRefreshing: false,
    error: null,
    username: parseUsernameFromJwt(data.access_token),
  })
}

// ============================================================================
// Store
// ============================================================================

/** In-flight refresh promise used to deduplicate concurrent refresh calls */
let refreshPromise: Promise<void> | null = null

export const useAuthStore = create<AuthStore>((set, get) => ({
  ...INITIAL_STATE,

  login: async (credentials: LoginCredentials) => {
    set({ isRefreshing: true, error: null })
    try {
      const data = await postAuth(AUTH_LOGIN_URL, credentials)
      applyTokenResponse(set, data)
    } catch (err) {
      set({
        ...INITIAL_STATE,
        error: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  },

  refresh: async () => {
    // Deduplicate: if a refresh is already in flight, wait for it
    if (refreshPromise) {
      await refreshPromise
      return
    }

    set({ isRefreshing: true, error: null })
    // `logout` increments `logoutCount` so we can drop stale refresh results after sign-out.
    const refreshEpoch = get().logoutCount

    // Holder avoids referencing `const currentRefresh` inside the IIFE before assignment (TS2454 / TDZ).
    const inFlightRefresh: { promise: Promise<void> | null } = { promise: null }
    const currentRefresh = (async () => {
      try {
        const data = await postAuth(AUTH_REFRESH_URL)
        if (get().logoutCount !== refreshEpoch) {
          return
        }
        applyTokenResponse(set, data)
      } catch (err) {
        if (get().logoutCount !== refreshEpoch) {
          return
        }
        set({
          ...INITIAL_STATE,
          error: err instanceof Error ? err.message : String(err),
        })
        throw err
      } finally {
        if (refreshPromise === inFlightRefresh.promise) {
          refreshPromise = null
        }
        // Stale-invocation early returns (epoch mismatch) skip applyTokenResponse / INITIAL_STATE — still
        // clear the spinner or AppLogin stays on LoadingState forever after sign-out or parallel logout.
        set({ isRefreshing: false })
      }
    })()

    inFlightRefresh.promise = currentRefresh
    refreshPromise = currentRefresh
    await currentRefresh
  },

  logout: async () => {
    const { accessToken, logoutCount } = get()
    // Drop any in-flight refresh waiters — otherwise AppLogin bootstrap can await this forever and
    // never leave the loading state. Stale refresh completions are ignored via `logoutCount` / epoch.
    refreshPromise = null

    // Revoke the session server-side FIRST so the HttpOnly cookie is cleared
    // before we reset local state. Otherwise AppLoginForm mounts and its
    // bootstrap useEffect fires a refresh() that races the logout POST —
    // the cookie is still present, so the refresh succeeds and the user
    // appears logged back in.
    const { error, redirectUrl, authError } = await revokeServerSession(accessToken)

    // Always clear local state, even if the server call failed
    set({ ...INITIAL_STATE, logoutCount: logoutCount + 1 })

    if (error) {
      throw error
    }

    // RP-initiated logout: the backend returned a redirect URL pointing to
    // the IdP's end_session_endpoint.  Navigate via window.location.href so
    // the browser sends first-party IdP cookies (HttpOnly included) and the
    // IdP session is terminated.
    if (redirectUrl) {
      window.location.href = redirectUrl
    } else if (authError) {
      // IdP logout failed (e.g. end_session_endpoint unresolvable) — pass the
      // error to the login page via URL param so it displays on mount.
      const loginUrl = new URL('/', window.location.origin)
      loginUrl.searchParams.set('auth_error', authError)
      window.location.href = loginUrl.toString()
    }
  },

  ensureValidToken: async () => {
    const { accessToken, expiresAt, isAuthenticated } = get()

    if (isAuthenticated && accessToken && !isTokenExpired(expiresAt)) {
      return // token is still valid
    }

    // Token missing or expired — attempt refresh
    await get().refresh()
  },

  clearAuth: () => {
    set({ ...INITIAL_STATE })
  },

  reset: () => {
    refreshPromise = null
    set({ ...INITIAL_STATE })
  },
}))

// ============================================================================
// Selectors
// ============================================================================

export const selectIsAuthenticated = (state: AuthStore) => state.isAuthenticated
export const selectIsRefreshing = (state: AuthStore) => state.isRefreshing

// ============================================================================
// Exported for testing
// ============================================================================

export { isTokenExpired, AUTH_LOGIN_URL, AUTH_REFRESH_URL, AUTH_LOGOUT_URL, EXPIRY_BUFFER_MS }
export type { LoginCredentials, LoginResponse, AuthState, AuthStore }
