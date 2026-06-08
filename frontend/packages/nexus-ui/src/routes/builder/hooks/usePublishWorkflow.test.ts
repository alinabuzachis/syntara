import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { usePublishWorkflow, useUnpublishWorkflow } from './usePublishWorkflow'

const mockPublishMutate = vi.fn()
const mockUnpublishMutate = vi.fn()
const mockShowSuccess = vi.fn()
const mockShowError = vi.fn()

vi.mock('../../../client', () => ({
  workflowClient: {
    useMutation: vi.fn((_method: string, path: string) => {
      if (path.includes('/publish')) {
        return { mutate: mockPublishMutate, isPending: false }
      }
      if (path.includes('/unpublish')) {
        return { mutate: mockUnpublishMutate, isPending: false }
      }
      return { mutate: vi.fn(), isPending: false }
    }),
  },
}))

vi.mock('../../../providers/alerts', () => ({
  useAlerts: () => ({
    showSuccess: mockShowSuccess,
    showError: mockShowError,
  }),
}))

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe('usePublishWorkflow', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  })

  it('calls publish mutation with correct params', () => {
    const { result } = renderHook(() => usePublishWorkflow('wf-123', 3), {
      wrapper: makeWrapper(queryClient),
    })

    act(() => {
      result.current.publish('v1.0')
    })

    expect(mockPublishMutate).toHaveBeenCalledWith(
      {
        params: { path: { workflow_id: 'wf-123', version: 3 } },
        body: { publish_name: 'v1.0', change_description: null },
      },
      expect.objectContaining({
        onSuccess: expect.any(Function) as unknown,
        onError: expect.any(Function) as unknown,
      })
    )
  })

  it('sends null publish_name when no name provided', () => {
    const { result } = renderHook(() => usePublishWorkflow('wf-123', 2), {
      wrapper: makeWrapper(queryClient),
    })

    act(() => {
      result.current.publish()
    })

    expect(mockPublishMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { publish_name: null, change_description: null },
      }),
      expect.any(Object)
    )
  })

  it('does not call mutation when workflowId is null', () => {
    const { result } = renderHook(() => usePublishWorkflow(null, 1), {
      wrapper: makeWrapper(queryClient),
    })

    act(() => {
      result.current.publish()
    })

    expect(mockPublishMutate).not.toHaveBeenCalled()
  })

  it('does not call mutation when currentVersion is undefined', () => {
    const { result } = renderHook(() => usePublishWorkflow('wf-123', undefined), {
      wrapper: makeWrapper(queryClient),
    })

    act(() => {
      result.current.publish()
    })

    expect(mockPublishMutate).not.toHaveBeenCalled()
  })

  it('shows success alert and invalidates queries on publish success', () => {
    mockPublishMutate.mockImplementation((_params: unknown, callbacks?: { onSuccess?: () => void }) => {
      callbacks?.onSuccess?.()
    })

    // Pre-populate the query cache with a workflows query so invalidation has something to match
    queryClient.setQueryData(['get', '/workflows'], { resources: [] })

    const { result } = renderHook(() => usePublishWorkflow('wf-123', 3), {
      wrapper: makeWrapper(queryClient),
    })

    act(() => {
      result.current.publish('v1.0', 'release notes')
    })

    expect(mockShowSuccess).toHaveBeenCalledWith({ title: 'Workflow published successfully' })
  })

  it('shows error alert on publish failure', () => {
    const mockError = new Error('Publish failed')
    mockPublishMutate.mockImplementation((_params: unknown, callbacks?: { onError?: (error: unknown) => void }) => {
      callbacks?.onError?.(mockError)
    })

    const { result } = renderHook(() => usePublishWorkflow('wf-123', 3), {
      wrapper: makeWrapper(queryClient),
    })

    act(() => {
      result.current.publish('v1.0')
    })

    expect(mockShowError).toHaveBeenCalledWith({
      title: 'Failed to publish workflow',
      description: 'Publish failed',
    })
  })

  it('calls onSettled callback after publish completes', () => {
    const onSettled = vi.fn()
    mockPublishMutate.mockImplementation(
      (_params: unknown, callbacks?: { onSuccess?: () => void; onSettled?: () => void }) => {
        callbacks?.onSuccess?.()
        callbacks?.onSettled?.()
      }
    )

    const { result } = renderHook(() => usePublishWorkflow('wf-123', 3), {
      wrapper: makeWrapper(queryClient),
    })

    act(() => {
      result.current.publish('v1.0', 'desc', onSettled)
    })

    expect(onSettled).toHaveBeenCalled()
  })

  it('sends description when provided', () => {
    const { result } = renderHook(() => usePublishWorkflow('wf-123', 2), {
      wrapper: makeWrapper(queryClient),
    })

    act(() => {
      result.current.publish('v2.0', 'My description')
    })

    expect(mockPublishMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { publish_name: 'v2.0', change_description: 'My description' },
      }),
      expect.any(Object)
    )
  })
})

describe('useUnpublishWorkflow', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  })

  it('calls unpublish mutation with correct params', () => {
    const { result } = renderHook(() => useUnpublishWorkflow('wf-456'), {
      wrapper: makeWrapper(queryClient),
    })

    act(() => {
      result.current.unpublish()
    })

    expect(mockUnpublishMutate).toHaveBeenCalledWith(
      { params: { path: { workflow_id: 'wf-456' } } },
      expect.objectContaining({
        onSuccess: expect.any(Function) as unknown,
        onError: expect.any(Function) as unknown,
      })
    )
  })

  it('does not call mutation when workflowId is null', () => {
    const { result } = renderHook(() => useUnpublishWorkflow(null), {
      wrapper: makeWrapper(queryClient),
    })

    act(() => {
      result.current.unpublish()
    })

    expect(mockUnpublishMutate).not.toHaveBeenCalled()
  })

  it('shows success alert and invalidates queries on unpublish success', () => {
    mockUnpublishMutate.mockImplementation((_params: unknown, callbacks?: { onSuccess?: () => void }) => {
      callbacks?.onSuccess?.()
    })

    const { result } = renderHook(() => useUnpublishWorkflow('wf-456'), {
      wrapper: makeWrapper(queryClient),
    })

    act(() => {
      result.current.unpublish()
    })

    expect(mockShowSuccess).toHaveBeenCalledWith({ title: 'Workflow unpublished successfully' })
  })

  it('shows error alert on unpublish failure', () => {
    const mockError = new Error('Unpublish failed')
    mockUnpublishMutate.mockImplementation((_params: unknown, callbacks?: { onError?: (error: unknown) => void }) => {
      callbacks?.onError?.(mockError)
    })

    const { result } = renderHook(() => useUnpublishWorkflow('wf-456'), {
      wrapper: makeWrapper(queryClient),
    })

    act(() => {
      result.current.unpublish()
    })

    expect(mockShowError).toHaveBeenCalledWith({
      title: 'Failed to unpublish workflow',
      description: 'Unpublish failed',
    })
  })
})
