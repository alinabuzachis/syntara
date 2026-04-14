import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { authMiddleware } from './client'
import { useAuthStore } from './stores/useAuthStore'

// Must import after vi.mock so the middleware picks up the mocked store

vi.mock('./stores/useAuthStore', () => ({
  useAuthStore: {
    getState: vi.fn(),
  },
}))

const mockGetState = useAuthStore.getState as ReturnType<typeof vi.fn>

describe('authMiddleware', () => {
  const mockEnsureValidToken = vi.fn()
  const mockRefresh = vi.fn()
  const mockClearAuth = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('onRequest', () => {
    it('sets Authorization header when token is available', async () => {
      mockGetState
        .mockReturnValueOnce({
          ensureValidToken: mockEnsureValidToken,
        })
        .mockReturnValueOnce({
          accessToken: 'test-token',
        })
      mockEnsureValidToken.mockResolvedValueOnce(undefined)

      const request = new Request('https://example.com/api')
      const result = await authMiddleware.onRequest!({ request } as Parameters<
        NonNullable<typeof authMiddleware.onRequest>
      >[0])

      expect(mockEnsureValidToken).toHaveBeenCalled()
      expect((result as Request).headers.get('Authorization')).toBe('Bearer test-token')
    })

    it('does not set Authorization header when no token', async () => {
      mockGetState
        .mockReturnValueOnce({
          ensureValidToken: mockEnsureValidToken,
        })
        .mockReturnValueOnce({
          accessToken: null,
        })
      mockEnsureValidToken.mockResolvedValueOnce(undefined)

      const request = new Request('https://example.com/api')
      const result = await authMiddleware.onRequest!({ request } as Parameters<
        NonNullable<typeof authMiddleware.onRequest>
      >[0])

      expect((result as Request).headers.has('Authorization')).toBe(false)
    })

    it('returns request without auth when ensureValidToken fails', async () => {
      mockGetState.mockReturnValueOnce({
        ensureValidToken: mockEnsureValidToken,
      })
      mockEnsureValidToken.mockRejectedValueOnce(new Error('Token expired'))

      const request = new Request('https://example.com/api')
      const result = await authMiddleware.onRequest!({ request } as Parameters<
        NonNullable<typeof authMiddleware.onRequest>
      >[0])

      expect(result).toBe(request)
      expect((result as Request).headers.has('Authorization')).toBe(false)
    })
  })

  describe('onResponse', () => {
    it('returns response as-is for non-401 status without stale header', async () => {
      const request = new Request('https://example.com/api')
      const response = new Response('OK', { status: 200 })

      const result = await authMiddleware.onResponse!({ request, response } as Parameters<
        NonNullable<typeof authMiddleware.onResponse>
      >[0])

      expect(result).toBe(response)
      expect(mockGetState).not.toHaveBeenCalled()
    })

    it('triggers background refresh when X-Token-Stale header is true', async () => {
      const request = new Request('https://example.com/api')
      const response = new Response('OK', {
        status: 200,
        headers: { 'X-Token-Stale': 'true' },
      })

      mockGetState.mockReturnValueOnce({
        refresh: mockRefresh,
      })
      mockRefresh.mockResolvedValueOnce(undefined)

      const result = await authMiddleware.onResponse!({ request, response } as Parameters<
        NonNullable<typeof authMiddleware.onResponse>
      >[0])

      expect(result).toBe(response)
      expect(mockRefresh).toHaveBeenCalled()
    })

    it('does not trigger refresh when X-Token-Stale header is absent', async () => {
      const request = new Request('https://example.com/api')
      const response = new Response('OK', { status: 200 })

      const result = await authMiddleware.onResponse!({ request, response } as Parameters<
        NonNullable<typeof authMiddleware.onResponse>
      >[0])

      expect(result).toBe(response)
      expect(mockRefresh).not.toHaveBeenCalled()
    })

    it('swallows errors from background stale refresh', async () => {
      const request = new Request('https://example.com/api')
      const response = new Response('OK', {
        status: 200,
        headers: { 'X-Token-Stale': 'true' },
      })

      mockGetState.mockReturnValueOnce({
        refresh: mockRefresh,
      })
      mockRefresh.mockRejectedValueOnce(new Error('Refresh failed'))

      const result = await authMiddleware.onResponse!({ request, response } as Parameters<
        NonNullable<typeof authMiddleware.onResponse>
      >[0])

      // Response is returned normally despite refresh error
      expect(result).toBe(response)
    })

    it('attempts refresh on 401 and retries request', async () => {
      const retryResponse = new Response('OK', { status: 200 })
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(retryResponse)

      mockGetState
        .mockReturnValueOnce({
          refresh: mockRefresh,
        })
        .mockReturnValueOnce({
          accessToken: 'refreshed-token',
        })
      mockRefresh.mockResolvedValueOnce(undefined)

      const request = new Request('https://example.com/api')
      const response = new Response('Unauthorized', { status: 401 })

      const result = await authMiddleware.onResponse!({ request, response } as Parameters<
        NonNullable<typeof authMiddleware.onResponse>
      >[0])

      expect(mockRefresh).toHaveBeenCalled()
      expect(result).toBe(retryResponse)

      const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0][0] as Request
      expect(fetchCall.headers.get('Authorization')).toBe('Bearer refreshed-token')
    })

    it('clears auth and returns original response when refresh fails', async () => {
      mockGetState.mockReturnValueOnce({
        refresh: mockRefresh,
        clearAuth: mockClearAuth,
      })
      mockRefresh.mockRejectedValueOnce(new Error('Refresh failed'))

      const request = new Request('https://example.com/api')
      const response = new Response('Unauthorized', { status: 401 })

      const result = await authMiddleware.onResponse!({ request, response } as Parameters<
        NonNullable<typeof authMiddleware.onResponse>
      >[0])

      expect(mockClearAuth).toHaveBeenCalled()
      expect(result).toBe(response)
    })

    it('returns original response when refresh succeeds but no token', async () => {
      mockGetState
        .mockReturnValueOnce({
          refresh: mockRefresh,
        })
        .mockReturnValueOnce({
          accessToken: null,
        })
      mockRefresh.mockResolvedValueOnce(undefined)

      const request = new Request('https://example.com/api')
      const response = new Response('Unauthorized', { status: 401 })

      const result = await authMiddleware.onResponse!({ request, response } as Parameters<
        NonNullable<typeof authMiddleware.onResponse>
      >[0])

      expect(result).toBe(response)
    })
  })
})
