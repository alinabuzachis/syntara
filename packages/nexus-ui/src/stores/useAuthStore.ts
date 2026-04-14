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

interface LoginResponse {
  access_token: string
  token_type: string
  expires_in: number
}

interface AuthState {
  accessToken: string | null
  expiresAt: number | null
  isAuthenticated: boolean
  isRefreshing: boolean
  error: string | null
  logoutCount: number
}

interface LoginCredentials {
  username: string
  password: string
}

interface AuthActions {
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
}

// ============================================================================
// Helpers
// ============================================================================

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

function applyTokenResponse(set: (partial: Partial<AuthState>) => void, data: LoginResponse): void {
  set({
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    isAuthenticated: true,
    isRefreshing: false,
    error: null,
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
    // Clear local session first so the user is never stuck appearing signed in if the server is down
    // or returns an error. Server-side invalidation is best-effort; callers may still show a warning.
    const { accessToken, logoutCount } = get()
    // Drop any in-flight refresh waiters — otherwise AppLogin bootstrap can await this forever and
    // never leave the loading state. Stale refresh completions are ignored via `logoutCount` / epoch.
    refreshPromise = null
    set({ ...INITIAL_STATE, logoutCount: logoutCount + 1 })

    const response = await fetch(AUTH_LOGOUT_URL, {
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
      throw new Error(detail)
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
export const selectAuthError = (state: AuthStore) => state.error
export const selectIsRefreshing = (state: AuthStore) => state.isRefreshing

// ============================================================================
// Exported for testing
// ============================================================================

export { isTokenExpired, AUTH_LOGIN_URL, AUTH_REFRESH_URL, AUTH_LOGOUT_URL, EXPIRY_BUFFER_MS }
export type { LoginCredentials, LoginResponse, AuthState, AuthStore }
