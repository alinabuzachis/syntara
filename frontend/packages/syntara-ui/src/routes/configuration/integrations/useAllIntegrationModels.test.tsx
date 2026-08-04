import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { integrationsFetchClient } from '../../../client'

import { useAllIntegrationModels } from './useAllIntegrationModels'

vi.mock('../../../client', () => ({
  integrationsFetchClient: {
    GET: vi.fn(),
  },
}))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
)

const mockModels = [
  { id: 'm1', name: 'gpt-4o', description: 'GPT-4o model', enabled: true, is_default: true },
  { id: 'm2', name: 'gpt-3.5-turbo', description: 'GPT-3.5 Turbo', enabled: true, is_default: false },
  { id: 'm3', name: 'gpt-4o-mini', description: 'GPT-4o mini', enabled: false, is_default: false },
]

describe('useAllIntegrationModels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryClient.clear()
  })

  it('returns models on successful fetch', async () => {
    vi.mocked(integrationsFetchClient.GET).mockResolvedValue({
      data: { resources: mockModels },
      error: null,
    } as never)

    const { result } = renderHook(() => useAllIntegrationModels('int-1'), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.models).toEqual(mockModels)
    expect(result.current.error).toBeNull()
  })

  it('returns empty array when no models exist', async () => {
    vi.mocked(integrationsFetchClient.GET).mockResolvedValue({
      data: { resources: [] },
      error: null,
    } as never)

    const { result } = renderHook(() => useAllIntegrationModels('int-1'), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.models).toEqual([])
  })

  it('is loading initially', () => {
    vi.mocked(integrationsFetchClient.GET).mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useAllIntegrationModels('int-1'), { wrapper })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.models).toEqual([])
  })

  it('returns error when fetch fails', async () => {
    vi.mocked(integrationsFetchClient.GET).mockResolvedValue({
      data: undefined,
      error: { detail: 'Forbidden' },
    } as never)

    const { result } = renderHook(() => useAllIntegrationModels('int-1'), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toBeTruthy()
  })

  it('does not fetch when integrationId is empty', () => {
    const { result } = renderHook(() => useAllIntegrationModels(''), { wrapper })

    expect(result.current.models).toEqual([])
    expect(integrationsFetchClient.GET).not.toHaveBeenCalled()
  })

  it('paginates through multiple pages', async () => {
    const page1 = [{ id: 'm1', name: 'model-a', description: '', enabled: true, is_default: false }]
    const page2 = [{ id: 'm2', name: 'model-b', description: '', enabled: false, is_default: false }]

    vi.mocked(integrationsFetchClient.GET)
      .mockResolvedValueOnce({ data: { resources: page1, next: 'cursor-1' }, error: null } as never)
      .mockResolvedValueOnce({ data: { resources: page2 }, error: null } as never)

    const { result } = renderHook(() => useAllIntegrationModels('int-1'), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.models).toEqual([...page1, ...page2])
    expect(integrationsFetchClient.GET).toHaveBeenCalledTimes(2)
  })

  it('passes integration_id in path parameters', async () => {
    vi.mocked(integrationsFetchClient.GET).mockResolvedValue({
      data: { resources: [] },
      error: null,
    } as never)

    renderHook(() => useAllIntegrationModels('int-42'), { wrapper })

    await waitFor(() => {
      expect(integrationsFetchClient.GET).toHaveBeenCalledWith(
        '/integrations/{integration_id}/models',
        expect.objectContaining({
          params: expect.objectContaining({
            path: { integration_id: 'int-42' },
          }) as Record<string, unknown>,
        })
      )
    })
  })

  it('provides a refetch function', async () => {
    vi.mocked(integrationsFetchClient.GET).mockResolvedValue({
      data: { resources: mockModels },
      error: null,
    } as never)

    const { result } = renderHook(() => useAllIntegrationModels('int-1'), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(typeof result.current.refetch).toBe('function')
  })
})
