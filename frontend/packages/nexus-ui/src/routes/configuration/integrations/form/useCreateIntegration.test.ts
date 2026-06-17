import type { ToolProviderCreate } from '@ansible/nexus-contracts'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useCreateIntegration } from './useCreateIntegration'

const mockNavigate = vi.fn()
const mockShowAlert = vi.fn()
const mockCreateMutation = vi.fn()
const mockValidateMutation = vi.fn()
const mockRefreshMutation = vi.fn()
const mockHandleError = vi.fn(() => vi.fn())

vi.mock('../../../../hooks/routing/navigate', () => ({
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  navigate: vi.fn((...args: unknown[]) => mockNavigate(...args)),
}))

vi.mock('../../../../providers/alerts', () => ({
  useAlerts: vi.fn(() => ({ showAlert: mockShowAlert })),
}))

vi.mock('../../../../client', () => ({
  toolManagerClient: {
    useMutation: vi.fn((_method: string, path: string) => {
      if (path === '/tool_manager/tool_providers') {
        return { mutate: mockCreateMutation }
      }
      if (path.includes('/validate')) {
        return { mutate: mockValidateMutation }
      }
      if (path.includes('/refresh_tools')) {
        return { mutate: mockRefreshMutation }
      }
      return { mutate: vi.fn() }
    }),
  },
}))

type FormData = ToolProviderCreate & { name: string }

function createTestFormData(overrides?: Partial<FormData>): FormData {
  return {
    name: 'Test Integration',
    description: 'Test description',
    configuration: {
      provider_type: 'mcp',
      base_url: 'http://localhost:3000',
      api_key: 'test-key',
    },
    ...overrides,
  }
}

describe('useCreateIntegration', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
    mockShowAlert.mockClear()
    mockCreateMutation.mockClear()
    mockValidateMutation.mockClear()
    mockRefreshMutation.mockClear()
    mockHandleError.mockClear()
    mockHandleError.mockReturnValue(vi.fn())
  })

  it('creates integration with correct body', () => {
    // Arrange
    const formData = createTestFormData()
    const { result } = renderHook(() => useCreateIntegration({ handleError: mockHandleError }))

    // Act
    act(() => {
      result.current(formData)
    })

    // Assert
    expect(mockCreateMutation).toHaveBeenCalledWith(
      { body: formData },
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        onSuccess: expect.any(Function),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        onError: expect.any(Function),
      })
    )
  })

  it('navigates to list on successful creation, validation, and refresh', () => {
    // Arrange
    const formData = createTestFormData()
    const { result } = renderHook(() => useCreateIntegration({ handleError: mockHandleError }))

    mockCreateMutation.mockImplementation((...args: unknown[]) => {
      const callbacks = args[1] as { onSuccess: (...args: unknown[]) => void }
      callbacks.onSuccess({ id: 'provider-123' })
    })
    mockValidateMutation.mockImplementation((...args: unknown[]) => {
      const callbacks = args[1] as { onSuccess: (...args: unknown[]) => void }
      callbacks.onSuccess({ valid: true, error: null })
    })
    mockRefreshMutation.mockImplementation((...args: unknown[]) => {
      const callbacks = args[1] as { onSettled: () => void }
      callbacks.onSettled()
    })

    // Act
    act(() => {
      result.current(formData)
    })

    // Assert
    expect(mockNavigate).toHaveBeenCalledWith('/configuration/integrations')
  })

  it('shows error and navigates when provider ID is missing', () => {
    // Arrange
    const formData = createTestFormData()
    const { result } = renderHook(() => useCreateIntegration({ handleError: mockHandleError }))
    const mockErrorCallback = vi.fn()
    mockHandleError.mockReturnValue(mockErrorCallback)

    mockCreateMutation.mockImplementation((...args: unknown[]) => {
      const callbacks = args[1] as { onSuccess: (...args: unknown[]) => void }
      callbacks.onSuccess({ id: null })
    })

    // Act
    act(() => {
      result.current(formData)
    })

    // Assert
    expect(mockHandleError).toHaveBeenCalledWith({
      title: 'Integration created, but missing ID',
      context: 'Integration "Test Integration"',
    })
    expect(mockErrorCallback).toHaveBeenCalledWith(new Error('Provider ID not returned from API'))
    expect(mockNavigate).toHaveBeenCalledWith('/configuration/integrations')
  })

  it('validates integration after creation', () => {
    // Arrange
    const formData = createTestFormData()
    const { result } = renderHook(() => useCreateIntegration({ handleError: mockHandleError }))

    mockCreateMutation.mockImplementation((...args: unknown[]) => {
      const callbacks = args[1] as { onSuccess: (...args: unknown[]) => void }
      callbacks.onSuccess({ id: 'provider-123' })
    })

    // Act
    act(() => {
      result.current(formData)
    })

    // Assert
    expect(mockValidateMutation).toHaveBeenCalledWith(
      { params: { path: { provider_id: 'provider-123' } } },
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        onSuccess: expect.any(Function),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        onError: expect.any(Function),
      })
    )
  })

  it('shows error and navigates when validation fails with error', () => {
    // Arrange
    const formData = createTestFormData()
    const { result } = renderHook(() => useCreateIntegration({ handleError: mockHandleError }))
    const mockErrorCallback = vi.fn()
    mockHandleError.mockReturnValue(mockErrorCallback)
    const validationError = new Error('Connection failed')

    mockCreateMutation.mockImplementation((...args: unknown[]) => {
      const callbacks = args[1] as { onSuccess: (...args: unknown[]) => void }
      callbacks.onSuccess({ id: 'provider-123' })
    })
    mockValidateMutation.mockImplementation((...args: unknown[]) => {
      const callbacks = args[1] as { onError: (...args: unknown[]) => void }
      callbacks.onError(validationError)
    })

    // Act
    act(() => {
      result.current(formData)
    })

    // Assert
    expect(mockHandleError).toHaveBeenCalledWith({
      title: 'Integration created, but validation failed',
      context: 'Integration "Test Integration"',
    })
    expect(mockErrorCallback).toHaveBeenCalledWith(validationError)
    expect(mockNavigate).toHaveBeenCalledWith('/configuration/integrations')
  })

  it('shows alert and navigates when validation returns invalid result', () => {
    // Arrange
    const formData = createTestFormData()
    const { result } = renderHook(() => useCreateIntegration({ handleError: mockHandleError }))

    mockCreateMutation.mockImplementation((...args: unknown[]) => {
      const callbacks = args[1] as { onSuccess: (...args: unknown[]) => void }
      callbacks.onSuccess({ id: 'provider-123' })
    })
    mockValidateMutation.mockImplementation((...args: unknown[]) => {
      const callbacks = args[1] as { onSuccess: (...args: unknown[]) => void }
      callbacks.onSuccess({ valid: false, error: 'Invalid API key' })
    })

    // Act
    act(() => {
      result.current(formData)
    })

    // Assert
    expect(mockShowAlert).toHaveBeenCalledWith({
      title: 'Integration created, but validation failed',
      description: 'Invalid API key',
      variant: 'error',
      autoDismiss: true,
    })
    expect(mockNavigate).toHaveBeenCalledWith('/configuration/integrations')
  })

  it('uses fallback message when validation returns invalid without error message', () => {
    // Arrange
    const formData = createTestFormData()
    const { result } = renderHook(() => useCreateIntegration({ handleError: mockHandleError }))

    mockCreateMutation.mockImplementation((...args: unknown[]) => {
      const callbacks = args[1] as { onSuccess: (...args: unknown[]) => void }
      callbacks.onSuccess({ id: 'provider-123' })
    })
    mockValidateMutation.mockImplementation((...args: unknown[]) => {
      const callbacks = args[1] as { onSuccess: (...args: unknown[]) => void }
      callbacks.onSuccess({ valid: false, error: null })
    })

    // Act
    act(() => {
      result.current(formData)
    })

    // Assert
    expect(mockShowAlert).toHaveBeenCalledWith({
      title: 'Integration created, but validation failed',
      description: 'Provider "Test Integration" could not be validated.',
      variant: 'error',
      autoDismiss: true,
    })
  })

  it('refreshes tools after successful validation', () => {
    // Arrange
    const formData = createTestFormData()
    const { result } = renderHook(() => useCreateIntegration({ handleError: mockHandleError }))

    mockCreateMutation.mockImplementation((...args: unknown[]) => {
      const callbacks = args[1] as { onSuccess: (...args: unknown[]) => void }
      callbacks.onSuccess({ id: 'provider-123' })
    })
    mockValidateMutation.mockImplementation((...args: unknown[]) => {
      const callbacks = args[1] as { onSuccess: (...args: unknown[]) => void }
      callbacks.onSuccess({ valid: true, error: null })
    })

    // Act
    act(() => {
      result.current(formData)
    })

    // Assert
    expect(mockRefreshMutation).toHaveBeenCalledWith(
      { params: { path: { provider_id: 'provider-123' } } },
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        onError: expect.any(Function),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        onSettled: expect.any(Function),
      })
    )
  })

  it('shows error but still navigates when refresh fails', () => {
    // Arrange
    const formData = createTestFormData()
    const { result } = renderHook(() => useCreateIntegration({ handleError: mockHandleError }))
    const mockErrorCallback = vi.fn()
    mockHandleError.mockReturnValue(mockErrorCallback)
    const refreshError = new Error('Refresh timeout')

    mockCreateMutation.mockImplementation((...args: unknown[]) => {
      const callbacks = args[1] as { onSuccess: (...args: unknown[]) => void }
      callbacks.onSuccess({ id: 'provider-123' })
    })
    mockValidateMutation.mockImplementation((...args: unknown[]) => {
      const callbacks = args[1] as { onSuccess: (...args: unknown[]) => void }
      callbacks.onSuccess({ valid: true, error: null })
    })
    mockRefreshMutation.mockImplementation((...args: unknown[]) => {
      const callbacks = args[1] as { onError: (...args: unknown[]) => void; onSettled: () => void }
      callbacks.onError(refreshError)
      callbacks.onSettled()
    })

    // Act
    act(() => {
      result.current(formData)
    })

    // Assert
    expect(mockHandleError).toHaveBeenCalledWith({
      title: 'Integration created, but refreshing tools failed',
      context: 'Integration "Test Integration"',
    })
    expect(mockNavigate).toHaveBeenCalledWith('/configuration/integrations')
  })

  it('handles creation error', () => {
    // Arrange
    const formData = createTestFormData()
    const { result } = renderHook(() => useCreateIntegration({ handleError: mockHandleError }))
    const mockErrorCallback = vi.fn()
    mockHandleError.mockReturnValue(mockErrorCallback)
    const creationError = new Error('Duplicate name')

    mockCreateMutation.mockImplementation((...args: unknown[]) => {
      const callbacks = args[1] as { onError: (...args: unknown[]) => void }
      callbacks.onError(creationError)
    })

    // Act
    act(() => {
      result.current(formData)
    })

    // Assert
    expect(mockHandleError).toHaveBeenCalledWith({
      title: 'Failed to add integration',
      context: 'Integration "Test Integration"',
    })
    expect(mockErrorCallback).toHaveBeenCalledWith(creationError)
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('uses undefined context when name is empty', () => {
    // Arrange
    const formData = createTestFormData({ name: '' })
    const { result } = renderHook(() => useCreateIntegration({ handleError: mockHandleError }))

    mockCreateMutation.mockImplementation((...args: unknown[]) => {
      const callbacks = args[1] as { onSuccess: (...args: unknown[]) => void }
      callbacks.onSuccess({ id: null })
    })

    // Act
    act(() => {
      result.current(formData)
    })

    // Assert
    expect(mockHandleError).toHaveBeenCalledWith({
      title: 'Integration created, but missing ID',
      context: undefined,
    })
  })

  it('returns a stable function reference across re-renders', () => {
    // Arrange
    const { result, rerender } = renderHook(() => useCreateIntegration({ handleError: mockHandleError }))
    const firstRef = result.current

    // Act
    rerender()

    // Assert
    expect(result.current).toBe(firstRef)
  })
})
