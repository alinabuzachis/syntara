import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { IntegrationFormData } from './integrationFormSchema'
import { useCreateIntegration } from './useCreateIntegration'

const { mockNavigate } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
}))

const mockShowAlert = vi.fn()
const mockCreateMutation = vi.fn()
const mockHandleError = vi.fn(() => vi.fn())

vi.mock('../../../../hooks/routing/navigate', () => ({
  navigate: mockNavigate,
}))

vi.mock('../../../../providers/alerts', () => ({
  useAlerts: vi.fn(() => ({ showAlert: mockShowAlert })),
}))

vi.mock('../../../../client', () => ({
  integrationsClient: {
    useMutation: vi.fn(() => ({ mutate: mockCreateMutation })),
  },
}))

function createTestFormData(overrides?: Partial<IntegrationFormData>): IntegrationFormData {
  return {
    name: 'Test Integration',
    description: 'Test description',
    integration_type: 'mcp_server',
    configuration: {
      integration_type: 'mcp_server',
      base_url: 'http://localhost:8765/mcp',
    },
    management_credential_id: null,
    scope: 'global',
    ...overrides,
  }
}

describe('useCreateIntegration', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
    mockShowAlert.mockClear()
    mockCreateMutation.mockClear()
    mockHandleError.mockClear()
    mockHandleError.mockReturnValue(vi.fn())
  })

  it('creates integration with correct body', () => {
    const formData = createTestFormData()
    const { result } = renderHook(() => useCreateIntegration({ handleError: mockHandleError }))

    act(() => {
      result.current(formData)
    })

    expect(mockCreateMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        body: expect.objectContaining({
          name: 'Test Integration',
          integration_type: 'mcp_server',
          configuration: { integration_type: 'mcp_server', base_url: 'http://localhost:8765/mcp' },
          scope: 'global',
        }),
      }),
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        onSuccess: expect.any(Function),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        onError: expect.any(Function),
      })
    )
  })

  it('shows success alert and navigates on create', () => {
    const formData = createTestFormData()
    const { result } = renderHook(() => useCreateIntegration({ handleError: mockHandleError }))

    mockCreateMutation.mockImplementation((...args: unknown[]) => {
      const callbacks = args[1] as { onSuccess: () => void }
      callbacks.onSuccess()
    })

    act(() => {
      result.current(formData)
    })

    expect(mockShowAlert).toHaveBeenCalledWith({
      title: 'Integration created',
      description: '"Test Integration" has been saved.',
      variant: 'success',
      autoDismiss: true,
    })
    expect(mockNavigate).toHaveBeenCalledWith('/configuration/integrations')
  })

  it('handles creation error without navigating', () => {
    const formData = createTestFormData()
    const { result } = renderHook(() => useCreateIntegration({ handleError: mockHandleError }))
    const mockErrorCallback = vi.fn()
    mockHandleError.mockReturnValue(mockErrorCallback)
    const creationError = new Error('Duplicate name')

    mockCreateMutation.mockImplementation((...args: unknown[]) => {
      const callbacks = args[1] as { onError: (...args: unknown[]) => void }
      callbacks.onError(creationError)
    })

    act(() => {
      result.current(formData)
    })

    expect(mockHandleError).toHaveBeenCalledWith({
      title: 'Failed to add integration',
      context: 'Integration "Test Integration"',
    })
    expect(mockErrorCallback).toHaveBeenCalledWith(creationError)
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('uses undefined context when name is empty', () => {
    const formData = createTestFormData({ name: '' })
    const { result } = renderHook(() => useCreateIntegration({ handleError: mockHandleError }))

    mockCreateMutation.mockImplementation((...args: unknown[]) => {
      const callbacks = args[1] as { onError: (...args: unknown[]) => void }
      callbacks.onError(new Error('fail'))
    })

    act(() => {
      result.current(formData)
    })

    expect(mockHandleError).toHaveBeenCalledWith({
      title: 'Failed to add integration',
      context: undefined,
    })
  })

  it('passes discovered_tools to the API when provided', () => {
    const formData = createTestFormData()
    const discoveredTools = [
      { name: 'get_repo', description: 'Get repo details', enabled: true },
      { name: 'create_pr', description: 'Create a PR', enabled: false },
    ]
    const { result } = renderHook(() => useCreateIntegration({ handleError: mockHandleError }))

    act(() => {
      result.current(formData, discoveredTools)
    })

    expect(mockCreateMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        body: expect.objectContaining({
          discovered_tools: discoveredTools,
        }),
      }),
      expect.any(Object)
    )
  })

  it('passes null discovered_tools when none provided', () => {
    const formData = createTestFormData()
    const { result } = renderHook(() => useCreateIntegration({ handleError: mockHandleError }))

    act(() => {
      result.current(formData)
    })

    expect(mockCreateMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        body: expect.objectContaining({
          discovered_tools: null,
        }),
      }),
      expect.any(Object)
    )
  })

  it('passes empty description through to the API', () => {
    const formData = createTestFormData({ description: '' })
    const { result } = renderHook(() => useCreateIntegration({ handleError: mockHandleError }))

    act(() => {
      result.current(formData)
    })

    expect(mockCreateMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        body: expect.objectContaining({
          description: '',
        }),
      }),
      expect.any(Object)
    )
  })

  it('passes management_credential_id when provided', () => {
    const formData = createTestFormData({ management_credential_id: 'cred-123' })
    const { result } = renderHook(() => useCreateIntegration({ handleError: mockHandleError }))

    act(() => {
      result.current(formData)
    })

    expect(mockCreateMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        body: expect.objectContaining({
          management_credential_id: 'cred-123',
        }),
      }),
      expect.any(Object)
    )
  })

  it('returns a stable function reference across re-renders', () => {
    const { result, rerender } = renderHook(() => useCreateIntegration({ handleError: mockHandleError }))
    const firstRef = result.current

    rerender()

    expect(result.current).toBe(firstRef)
  })
})
