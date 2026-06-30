import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProjectRead } from '../access/types'

import { useProjectActions } from './useProjectActions'

// Mock the access client
vi.mock('../access/accessClient', () => ({
  accessClient: {
    useMutation: vi.fn(() => ({
      mutate: vi.fn(
        (_params: unknown, callbacks?: { onSuccess?: () => void; onSettled?: () => void; onError?: () => void }) => {
          // Simulate successful deletion
          callbacks?.onSuccess?.()
          callbacks?.onSettled?.()
        }
      ),
      isPending: false,
    })),
  },
}))

// Helper to create mock project objects for testing
function mockProject(overrides: Partial<ProjectRead> = {}): ProjectRead {
  return {
    id: 'proj-1',
    name: 'Test Project',
    description: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    labels: {},
    ...overrides,
  }
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useProjectActions', () => {
  const mockShowSuccess = vi.fn()
  const mockShowError = vi.fn()
  const mockOnRefetch = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('onDeleteSettled callback', () => {
    it('calls onDeleteSettled when delete mutation completes', async () => {
      const mockOnDeleteSettled = vi.fn()
      const { result } = renderHook(
        () =>
          useProjectActions({
            showSuccess: mockShowSuccess,
            showError: mockShowError,
            onRefetch: mockOnRefetch,
            onDeleteSettled: mockOnDeleteSettled,
          }),
        { wrapper: createWrapper() }
      )

      const project = mockProject()
      result.current.handleDeleteProject(project)

      await waitFor(() => {
        expect(mockOnDeleteSettled).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('success messages', () => {
    it('shows correct delete success message with project name', async () => {
      const { result } = renderHook(
        () =>
          useProjectActions({
            showSuccess: mockShowSuccess,
            showError: mockShowError,
            onRefetch: mockOnRefetch,
          }),
        { wrapper: createWrapper() }
      )

      const project = { id: 'proj-1', name: 'My Project' }
      result.current.handleDeleteProject(project)

      await waitFor(() => {
        expect(mockShowSuccess).toHaveBeenCalledWith({
          title: 'Project deleted',
          description: 'Project "My Project" has been deleted successfully.',
        })
      })
    })
  })

  describe('refetch behavior', () => {
    it('calls onRefetch after successful delete', async () => {
      const { result } = renderHook(
        () =>
          useProjectActions({
            showSuccess: mockShowSuccess,
            showError: mockShowError,
            onRefetch: mockOnRefetch,
          }),
        { wrapper: createWrapper() }
      )

      const project = { id: 'proj-1', name: 'Test' }
      result.current.handleDeleteProject(project)

      await waitFor(() => {
        expect(mockOnRefetch).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('guard conditions', () => {
    it('does not call delete mutation when project has no id', () => {
      const { result } = renderHook(
        () =>
          useProjectActions({
            showSuccess: mockShowSuccess,
            showError: mockShowError,
            onRefetch: mockOnRefetch,
          }),
        { wrapper: createWrapper() }
      )

      const project = mockProject({ id: undefined })
      result.current.handleDeleteProject(project)

      // Should not show success or refetch if id is missing
      expect(mockShowSuccess).not.toHaveBeenCalled()
      expect(mockOnRefetch).not.toHaveBeenCalled()
    })
  })
})
