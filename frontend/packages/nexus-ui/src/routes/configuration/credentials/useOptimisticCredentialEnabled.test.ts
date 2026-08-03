import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Credential } from './credentialConstants'
import { useOptimisticCredentialEnabled } from './useOptimisticCredentialEnabled'

function makeCredential(overrides: Partial<Credential> & Pick<Credential, 'id' | 'enabled'>): Credential {
  return {
    name: 'Test credential',
    description: '',
    credential_type_id: 'type-1',
    inputs: {},
    labels: {},
    project_id: 'proj-1',
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('useOptimisticCredentialEnabled', () => {
  it('optimistically enables a credential before the patch resolves', async () => {
    let resolvePatch!: (value: unknown) => void
    const patchCredential = vi.fn(
      () =>
        new Promise((resolve) => {
          resolvePatch = resolve
        })
    )
    const onSuccess = vi.fn().mockResolvedValue(undefined)
    const onError = vi.fn()
    const credential = makeCredential({ id: '1', enabled: false })

    const { result, rerender } = renderHook(
      ({ credentials }) =>
        useOptimisticCredentialEnabled({
          credentials,
          patchCredential,
          onSuccess,
          onError,
        }),
      { initialProps: { credentials: [credential] } }
    )

    act(() => {
      result.current.setCredentialEnabled(credential, true)
    })

    await waitFor(() => {
      expect(result.current.credentials[0]?.enabled).toBe(true)
    })
    expect(patchCredential).toHaveBeenCalledWith({
      params: { path: { credential_id: '1' } },
      body: { enabled: true },
    })

    await act(async () => {
      resolvePatch({})
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled()
    })

    // Parent converges to server state after success.
    rerender({ credentials: [makeCredential({ id: '1', enabled: true })] })
    expect(result.current.credentials[0]?.enabled).toBe(true)
    expect(onError).not.toHaveBeenCalled()
  })

  it('rolls back optimistic enable when the patch fails', async () => {
    const patchCredential = vi.fn().mockRejectedValue(new Error('Server error'))
    const onSuccess = vi.fn()
    const onError = vi.fn()
    const credential = makeCredential({ id: '1', enabled: false })

    const { result } = renderHook(() =>
      useOptimisticCredentialEnabled({
        credentials: [credential],
        patchCredential,
        onSuccess,
        onError,
      })
    )

    act(() => {
      result.current.setCredentialEnabled(credential, true)
    })

    await waitFor(() => {
      expect(result.current.credentials[0]?.enabled).toBe(true)
    })

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('Failed to enable credential', expect.any(Error))
    })

    await waitFor(() => {
      expect(result.current.credentials[0]?.enabled).toBe(false)
    })
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('optimistically disables and reports disable errors', async () => {
    const patchCredential = vi.fn().mockRejectedValue(new Error('Nope'))
    const onSuccess = vi.fn()
    const onError = vi.fn()
    const credential = makeCredential({ id: '2', enabled: true })

    const { result } = renderHook(() =>
      useOptimisticCredentialEnabled({
        credentials: [credential],
        patchCredential,
        onSuccess,
        onError,
      })
    )

    act(() => {
      result.current.setCredentialEnabled(credential, false)
    })

    await waitFor(() => {
      expect(result.current.credentials[0]?.enabled).toBe(false)
    })

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('Failed to disable credential', expect.any(Error))
    })

    await waitFor(() => {
      expect(result.current.credentials[0]?.enabled).toBe(true)
    })
  })

  it('no-ops when the credential has no id', () => {
    const patchCredential = vi.fn()
    const { result } = renderHook(() =>
      useOptimisticCredentialEnabled({
        credentials: [makeCredential({ id: '1', enabled: false })],
        patchCredential,
        onSuccess: vi.fn(),
        onError: vi.fn(),
      })
    )

    act(() => {
      result.current.setCredentialEnabled({ ...makeCredential({ id: '1', enabled: false }), id: undefined }, true)
    })

    expect(patchCredential).not.toHaveBeenCalled()
  })
})
