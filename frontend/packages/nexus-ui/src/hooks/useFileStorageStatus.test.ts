import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useFileStorageStatus } from './useFileStorageStatus'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

function mockFetchResponse(body: unknown, ok = true) {
  vi.mocked(global.fetch).mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(body),
  } as Response)
}

describe('useFileStorageStatus', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns isConfigured true when file_storage is "ok"', async () => {
    mockFetchResponse({ status: 'ok', checks: { file_storage: 'ok' } })

    const { result } = renderHook(() => useFileStorageStatus(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.isConfigured).toBe(true)
    expect(result.current.isError).toBe(false)
    expect(global.fetch).toHaveBeenCalledWith('/health')
  })

  it('returns isConfigured true when file_storage is "degraded"', async () => {
    mockFetchResponse({ status: 'degraded', checks: { file_storage: 'degraded' } })

    const { result } = renderHook(() => useFileStorageStatus(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.isConfigured).toBe(true)
  })

  it('returns isConfigured true when file_storage is "error"', async () => {
    mockFetchResponse({ status: 'error', checks: { file_storage: 'error' } })

    const { result } = renderHook(() => useFileStorageStatus(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.isConfigured).toBe(true)
  })

  it('returns isConfigured false when file_storage is "unconfigured"', async () => {
    mockFetchResponse({ status: 'ok', checks: { file_storage: 'unconfigured' } })

    const { result } = renderHook(() => useFileStorageStatus(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.isConfigured).toBe(false)
  })

  it('defaults to isConfigured true and isLoading true while in flight', () => {
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useFileStorageStatus(), { wrapper: createWrapper() })

    expect(result.current.isConfigured).toBe(true)
    expect(result.current.isLoading).toBe(true)
  })

  it('defaults to isConfigured true when fetch fails', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('network error'))

    const { result } = renderHook(() => useFileStorageStatus(), { wrapper: createWrapper() })

    await waitFor(
      () => {
        expect(result.current.isLoading).toBe(false)
      },
      { timeout: 5000 }
    )

    expect(result.current.isConfigured).toBe(true)
    expect(result.current.isError).toBe(true)
  })

  it('defaults to isConfigured true when response is not ok', async () => {
    mockFetchResponse(null, false)

    const { result } = renderHook(() => useFileStorageStatus(), { wrapper: createWrapper() })

    await waitFor(
      () => {
        expect(result.current.isLoading).toBe(false)
      },
      { timeout: 5000 }
    )

    expect(result.current.isConfigured).toBe(true)
    expect(result.current.isError).toBe(true)
  })

  it('defaults to isConfigured true when response has unexpected shape', async () => {
    mockFetchResponse({ unexpected: 'shape' })

    const { result } = renderHook(() => useFileStorageStatus(), { wrapper: createWrapper() })

    await waitFor(
      () => {
        expect(result.current.isLoading).toBe(false)
      },
      { timeout: 5000 }
    )

    expect(result.current.isConfigured).toBe(true)
    expect(result.current.isError).toBe(true)
  })
})
