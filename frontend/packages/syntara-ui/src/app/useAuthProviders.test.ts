import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthProviders } from './useAuthProviders'

describe('useAuthProviders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset fetch mock
    global.fetch = vi.fn()
  })

  it('returns empty array and sets loading to false on successful fetch with providers', async () => {
    // Arrange
    const mockProviders = [
      { id: 'okta-1', name: 'Okta', provider_type: 'oidc' },
      { id: 'azure-1', name: 'Azure AD', provider_type: 'oidc' },
    ]
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ resources: mockProviders }),
    })

    // Act
    const { result } = renderHook(() => useAuthProviders())

    // Assert - Initially loading
    expect(result.current.isLoading).toBe(true)
    expect(result.current.providers).toEqual([])

    // Wait for async update
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.providers).toEqual(mockProviders)
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/auth/providers',
      expect.objectContaining({
        headers: { 'X-Nexus-Client': 'ui' },
        signal: expect.any(AbortSignal) as AbortSignal,
      })
    )
  })

  it('returns empty array when fetch fails', async () => {
    // Arrange
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    // Act
    const { result } = renderHook(() => useAuthProviders())

    // Assert - Initially loading
    expect(result.current.isLoading).toBe(true)
    expect(result.current.providers).toEqual([])

    // Wait for async update
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.providers).toEqual([])
  })

  it('returns empty array when response is not ok', async () => {
    // Arrange
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    })

    // Act
    const { result } = renderHook(() => useAuthProviders())

    // Assert
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.providers).toEqual([])
  })

  it('sets loading to true initially', () => {
    // Arrange
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              json: () => Promise.resolve({ resources: [] }),
            })
          }, 100)
        })
    )

    // Act
    const { result } = renderHook(() => useAuthProviders())

    // Assert
    expect(result.current.isLoading).toBe(true)
  })

  it('handles empty providers array', async () => {
    // Arrange
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ resources: [] }),
    })

    // Act
    const { result } = renderHook(() => useAuthProviders())

    // Assert
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.providers).toEqual([])
  })

  it('handles single provider', async () => {
    // Arrange
    const mockProvider = { id: 'google-1', name: 'Google', provider_type: 'oidc' }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ resources: [mockProvider] }),
    })

    // Act
    const { result } = renderHook(() => useAuthProviders())

    // Assert
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.providers).toEqual([mockProvider])
  })

  it('does not update state if component unmounts before fetch completes', async () => {
    // Arrange
    let resolvePromise: (value: unknown) => void
    const fetchPromise = new Promise((resolve) => {
      resolvePromise = resolve
    })
    global.fetch = vi.fn().mockReturnValue(fetchPromise)

    // Act
    const { result, unmount } = renderHook(() => useAuthProviders())

    // Assert - Initially loading
    expect(result.current.isLoading).toBe(true)

    // Unmount before fetch completes
    unmount()

    // Resolve fetch after unmount
    resolvePromise!({
      ok: true,
      json: () => Promise.resolve({ resources: [{ id: '1', name: 'Test', provider_type: 'oidc' }] }),
    })

    // Wait a bit to ensure no state update happens
    await new Promise((resolve) => setTimeout(resolve, 10))

    // State should not have changed after unmount
    expect(result.current.isLoading).toBe(true)
  })

  it('calls fetch only once on mount', async () => {
    // Arrange
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ resources: [] }),
    })

    // Act
    renderHook(() => useAuthProviders())

    // Assert
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })
  })

  it('handles JSON parse errors gracefully', async () => {
    // Arrange
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new Error('Invalid JSON')),
    })

    // Act
    const { result } = renderHook(() => useAuthProviders())

    // Assert
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.providers).toEqual([])
  })
})
