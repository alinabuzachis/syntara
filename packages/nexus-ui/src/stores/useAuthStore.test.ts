import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  useAuthStore,
  isTokenExpired,
  EXPIRY_BUFFER_MS,
  AUTH_LOGIN_URL,
  AUTH_REFRESH_URL,
  AUTH_LOGOUT_URL,
} from './useAuthStore'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function createTokenResponse(overrides?: Partial<{ access_token: string; token_type: string; expires_in: number }>) {
  return {
    access_token: 'test-access-token',
    token_type: 'Bearer',
    expires_in: 900,
    ...overrides,
  }
}

function mockFetchSuccess(data: unknown, status = 200) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  })
}

function mockFetchError(detail: string, status = 401) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    json: () => Promise.resolve({ detail }),
    text: () => Promise.resolve(JSON.stringify({ detail })),
  })
}

describe('useAuthStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.getState().reset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('isTokenExpired', () => {
    it('returns true when expiresAt is null', () => {
      expect(isTokenExpired(null)).toBe(true)
    })

    it('returns true when token is expired', () => {
      const pastTime = Date.now() - 1000
      expect(isTokenExpired(pastTime)).toBe(true)
    })

    it('returns true when token is within the buffer window', () => {
      const almostExpired = Date.now() + EXPIRY_BUFFER_MS - 1000
      expect(isTokenExpired(almostExpired)).toBe(true)
    })

    it('returns false when token is still valid', () => {
      const futureTime = Date.now() + EXPIRY_BUFFER_MS + 60_000
      expect(isTokenExpired(futureTime)).toBe(false)
    })
  })

  describe('initial state', () => {
    it('starts unauthenticated', () => {
      const state = useAuthStore.getState()
      expect(state.accessToken).toBeNull()
      expect(state.expiresAt).toBeNull()
      expect(state.isAuthenticated).toBe(false)
      expect(state.isRefreshing).toBe(false)
      expect(state.error).toBeNull()
    })
  })

  describe('login', () => {
    it('stores token on successful login', async () => {
      const tokenData = createTokenResponse()
      mockFetchSuccess(tokenData)

      await useAuthStore.getState().login({ username: 'admin', password: 'admin' })

      const state = useAuthStore.getState()
      expect(state.accessToken).toBe('test-access-token')
      expect(state.isAuthenticated).toBe(true)
      expect(state.isRefreshing).toBe(false)
      expect(state.error).toBeNull()
      expect(state.expiresAt).toBeGreaterThan(Date.now())
    })

    it('posts to the login endpoint with credentials included', async () => {
      mockFetchSuccess(createTokenResponse())

      await useAuthStore.getState().login({ username: 'admin', password: 'admin' })

      expect(mockFetch).toHaveBeenCalledWith(AUTH_LOGIN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: 'admin', password: 'admin' }),
      })
    })

    it('sets error on login failure', async () => {
      mockFetchError('Invalid credentials', 401)

      await expect(useAuthStore.getState().login({ username: 'admin', password: 'wrong' })).rejects.toThrow(
        'Invalid credentials'
      )

      const state = useAuthStore.getState()
      expect(state.accessToken).toBeNull()
      expect(state.isAuthenticated).toBe(false)
      expect(state.error).toBe('Invalid credentials')
    })

    it('computes expiresAt from expires_in', async () => {
      const now = Date.now()
      vi.spyOn(Date, 'now').mockReturnValue(now)

      mockFetchSuccess(createTokenResponse({ expires_in: 600 }))

      await useAuthStore.getState().login({ username: 'admin', password: 'admin' })

      const state = useAuthStore.getState()
      expect(state.expiresAt).toBe(now + 600 * 1000)
    })
  })

  describe('refresh', () => {
    it('updates token on successful refresh', async () => {
      const tokenData = createTokenResponse({ access_token: 'refreshed-token' })
      mockFetchSuccess(tokenData)

      await useAuthStore.getState().refresh()

      const state = useAuthStore.getState()
      expect(state.accessToken).toBe('refreshed-token')
      expect(state.isAuthenticated).toBe(true)
    })

    it('posts to the refresh endpoint', async () => {
      mockFetchSuccess(createTokenResponse())

      await useAuthStore.getState().refresh()

      expect(mockFetch).toHaveBeenCalledWith(AUTH_REFRESH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
    })

    it('clears auth state on refresh failure', async () => {
      // First login successfully
      mockFetchSuccess(createTokenResponse())
      await useAuthStore.getState().login({ username: 'admin', password: 'admin' })
      expect(useAuthStore.getState().isAuthenticated).toBe(true)

      // Then refresh fails
      mockFetchError('Token expired', 401)

      await expect(useAuthStore.getState().refresh()).rejects.toThrow('Token expired')

      const state = useAuthStore.getState()
      expect(state.accessToken).toBeNull()
      expect(state.isAuthenticated).toBe(false)
      expect(state.error).toBe('Token expired')
    })

    it('deduplicates concurrent refresh calls', async () => {
      mockFetchSuccess(createTokenResponse({ access_token: 'deduped-token' }))

      const p1 = useAuthStore.getState().refresh()
      const p2 = useAuthStore.getState().refresh()
      const p3 = useAuthStore.getState().refresh()

      await Promise.all([p1, p2, p3])

      // Only one fetch call should have been made
      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(useAuthStore.getState().accessToken).toBe('deduped-token')
    })

    it('clears isRefreshing when a refresh completes after logout (stale epoch)', async () => {
      const releaseBox: { fn?: (value: void | PromiseLike<void>) => void } = {}
      const refreshGate = new Promise<void>((resolve) => {
        releaseBox.fn = resolve
      })

      mockFetchSuccess(createTokenResponse())
      await useAuthStore.getState().login({ username: 'admin', password: 'admin' })

      mockFetch.mockImplementationOnce(() =>
        refreshGate.then(() => ({
          ok: true,
          status: 200,
          json: () => Promise.resolve(createTokenResponse({ access_token: 'stale-refresh-token' })),
          text: () => Promise.resolve(JSON.stringify(createTokenResponse({ access_token: 'stale-refresh-token' }))),
        }))
      )

      const refreshDone = useAuthStore.getState().refresh()
      expect(useAuthStore.getState().isRefreshing).toBe(true)

      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })
      await useAuthStore.getState().logout()

      releaseBox.fn?.()
      await refreshDone

      expect(useAuthStore.getState().isRefreshing).toBe(false)
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
      expect(useAuthStore.getState().accessToken).toBeNull()
    })
  })

  describe('logout', () => {
    it('clears auth state after logout', async () => {
      // First login
      mockFetchSuccess(createTokenResponse())
      await useAuthStore.getState().login({ username: 'admin', password: 'admin' })
      expect(useAuthStore.getState().isAuthenticated).toBe(true)

      // Then logout (logout endpoint returns 200 with no body)
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })

      await useAuthStore.getState().logout()

      const state = useAuthStore.getState()
      expect(state.accessToken).toBeNull()
      expect(state.isAuthenticated).toBe(false)
      expect(state.expiresAt).toBeNull()
    })

    it('posts to the logout endpoint with bearer token', async () => {
      // First login
      mockFetchSuccess(createTokenResponse({ access_token: 'my-token' }))
      await useAuthStore.getState().login({ username: 'admin', password: 'admin' })

      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })
      await useAuthStore.getState().logout()

      expect(mockFetch).toHaveBeenLastCalledWith(AUTH_LOGOUT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer my-token',
        },
        credentials: 'include',
      })
    })

    it('clears local state when logout request fails (network), then rejects', async () => {
      mockFetchSuccess(createTokenResponse())
      await useAuthStore.getState().login({ username: 'admin', password: 'admin' })

      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      await expect(useAuthStore.getState().logout()).rejects.toThrow('Network error')

      expect(useAuthStore.getState().isAuthenticated).toBe(false)
      expect(useAuthStore.getState().accessToken).toBeNull()
      expect(useAuthStore.getState().logoutCount).toBe(1)
    })

    it('clears local state when logout returns non-OK, then rejects', async () => {
      mockFetchSuccess(createTokenResponse())
      await useAuthStore.getState().login({ username: 'admin', password: 'admin' })

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: () => Promise.resolve('Service unavailable'),
      })

      await expect(useAuthStore.getState().logout()).rejects.toThrow()

      expect(useAuthStore.getState().isAuthenticated).toBe(false)
      expect(useAuthStore.getState().accessToken).toBeNull()
    })
  })

  describe('ensureValidToken', () => {
    it('does nothing when token is still valid', async () => {
      mockFetchSuccess(createTokenResponse({ expires_in: 3600 }))
      await useAuthStore.getState().login({ username: 'admin', password: 'admin' })
      mockFetch.mockClear()

      await useAuthStore.getState().ensureValidToken()

      // No additional fetch calls
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('refreshes when token is expired', async () => {
      // Set up an expired token
      const now = Date.now()
      vi.spyOn(Date, 'now').mockReturnValue(now)

      mockFetchSuccess(createTokenResponse({ expires_in: 1 }))
      await useAuthStore.getState().login({ username: 'admin', password: 'admin' })

      // Fast-forward past expiry
      vi.spyOn(Date, 'now').mockReturnValue(now + EXPIRY_BUFFER_MS + 2000)

      mockFetchSuccess(createTokenResponse({ access_token: 'refreshed-token' }))

      await useAuthStore.getState().ensureValidToken()

      expect(useAuthStore.getState().accessToken).toBe('refreshed-token')
    })

    it('refreshes when not authenticated', async () => {
      mockFetchSuccess(createTokenResponse({ access_token: 'new-token' }))

      await useAuthStore.getState().ensureValidToken()

      expect(useAuthStore.getState().accessToken).toBe('new-token')
      expect(useAuthStore.getState().isAuthenticated).toBe(true)
    })
  })

  describe('clearAuth', () => {
    it('resets all auth state without calling logout endpoint', async () => {
      mockFetchSuccess(createTokenResponse())
      await useAuthStore.getState().login({ username: 'admin', password: 'admin' })
      mockFetch.mockClear()

      useAuthStore.getState().clearAuth()

      const state = useAuthStore.getState()
      expect(state.accessToken).toBeNull()
      expect(state.isAuthenticated).toBe(false)
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })
})
