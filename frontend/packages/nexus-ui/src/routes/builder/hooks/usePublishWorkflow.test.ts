import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useWorkflowStore } from '../../../stores/useWorkflowStore'

import { usePublishWorkflow, useUnpublishWorkflow } from './usePublishWorkflow'

const mockPublishMutate = vi.fn()
const mockUnpublishMutate = vi.fn()
const mockShowSuccess = vi.fn()
const mockShowError = vi.fn()
const mockMarkClean = vi.fn()
const mockBuildWorkflowDefinition = vi.fn()

vi.mock('../../../stores/useWorkflowStore', () => ({
  useWorkflowStore: {
    getState: vi.fn(() => ({
      currentWorkflow: null,
      isDirty: false,
      edges: [],
      nodePositions: {},
      _positionsUserModified: false,
      markClean: mockMarkClean,
    })),
  },
}))

vi.mock('../utils/workflowDefinitionBuilder', () => ({
  buildWorkflowDefinition: (...args: unknown[]) => {
    mockBuildWorkflowDefinition(...args)
    return { built: true }
  },
}))

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
  authMiddleware: { onRequest: vi.fn() },
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

  it('includes workflow_definition in body when store is dirty', () => {
    const mockWorkflow = {
      workflow: { name: 'Test WF', description: 'A desc', activities: [{ id: 'a1' }] },
      triggers: [{ id: 't1' }],
    }
    vi.mocked(useWorkflowStore.getState).mockReturnValue({
      currentWorkflow: mockWorkflow,
      isDirty: true,
      edges: [{ id: 'e1' }],
      nodePositions: { n1: { x: 10, y: 20 } },
      _positionsUserModified: true,
      markClean: mockMarkClean,
    } as unknown as ReturnType<typeof useWorkflowStore.getState>)

    const { result } = renderHook(() => usePublishWorkflow('wf-123', 3, 'My WF', 'My Desc'), {
      wrapper: makeWrapper(queryClient),
    })

    act(() => {
      result.current.publish('v1.0')
    })

    expect(mockBuildWorkflowDefinition).toHaveBeenCalledWith('My WF', 'My Desc', [{ id: 'a1' }], [{ id: 't1' }], {
      edges: [{ id: 'e1' }],
      nodePositions: { n1: { x: 10, y: 20 } },
    })
    const publishCall = mockPublishMutate.mock.calls[0] as unknown[]
    const requestArg = publishCall[0] as { body: Record<string, unknown> }
    expect(requestArg.body).toHaveProperty('workflow_definition', { built: true })
  })

  it('calls markClean on success when workflow_definition was sent', () => {
    const mockWorkflow = {
      workflow: { name: 'Test WF', description: 'A desc', activities: [] },
      triggers: [],
    }
    vi.mocked(useWorkflowStore.getState).mockReturnValue({
      currentWorkflow: mockWorkflow,
      isDirty: true,
      edges: [],
      nodePositions: {},
      _positionsUserModified: false,
      markClean: mockMarkClean,
    } as unknown as ReturnType<typeof useWorkflowStore.getState>)

    mockPublishMutate.mockImplementation((_params: unknown, callbacks?: { onSuccess?: () => void }) => {
      callbacks?.onSuccess?.()
    })

    const { result } = renderHook(() => usePublishWorkflow('wf-123', 3), {
      wrapper: makeWrapper(queryClient),
    })

    act(() => {
      result.current.publish('v1.0')
    })

    expect(mockMarkClean).toHaveBeenCalled()
  })

  it('does not include workflow_definition when store is clean', () => {
    vi.mocked(useWorkflowStore.getState).mockReturnValue({
      currentWorkflow: {
        workflow: { name: 'Test WF', description: 'A desc', activities: [] },
        triggers: [],
      },
      isDirty: false,
      edges: [],
      nodePositions: {},
      _positionsUserModified: false,
      markClean: mockMarkClean,
    } as unknown as ReturnType<typeof useWorkflowStore.getState>)

    const { result } = renderHook(() => usePublishWorkflow('wf-123', 3), {
      wrapper: makeWrapper(queryClient),
    })

    act(() => {
      result.current.publish('v1.0')
    })

    expect(mockBuildWorkflowDefinition).not.toHaveBeenCalled()
    const publishCall = mockPublishMutate.mock.calls[0] as unknown[]
    const requestArg = publishCall[0] as { body: Record<string, unknown> }
    expect(requestArg.body).not.toHaveProperty('workflow_definition')
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
