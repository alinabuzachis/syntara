import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { tanstackRouter } from '../../../../app/tanstackRouter'

import type { IntegrationFormData } from './integrationFormSchema'
import { useCreateIntegration } from './useCreateIntegration'

const mockShowAlert = vi.fn()
const mockCreateMutation = vi.fn()
const mockHandleError = vi.fn(() => vi.fn())

vi.mock('../../../../app/tanstackRouter', () => ({
  tanstackRouter: { navigate: vi.fn().mockResolvedValue(undefined) },
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
  } as IntegrationFormData
}

describe('useCreateIntegration', () => {
  beforeEach(() => {
    vi.mocked(tanstackRouter.navigate).mockClear()
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

    expect(mockCreateMutation).toHaveBeenCalledOnce()
    const callArgs: unknown[] = mockCreateMutation.mock.calls[0] as unknown[]
    const reqArg = callArgs[0] as Record<string, unknown>
    const callbacksArg = callArgs[1] as Record<string, unknown>
    expect(reqArg.body).toMatchObject({
      name: 'Test Integration',
      integration_type: 'mcp_server',
      configuration: { integration_type: 'mcp_server', base_url: 'http://localhost:8765/mcp' },
      scope: 'global',
    })
    expect(callbacksArg).toEqual(
      expect.objectContaining({
        onSuccess: expect.any(Function) as unknown,
        onError: expect.any(Function) as unknown,
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
    expect(vi.mocked(tanstackRouter.navigate)).toHaveBeenCalledWith(
      expect.objectContaining({ to: '/configuration/integrations' })
    )
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
    expect(vi.mocked(tanstackRouter.navigate)).not.toHaveBeenCalled()
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

    expect(mockCreateMutation).toHaveBeenCalledOnce()
    const [reqArg] = mockCreateMutation.mock.calls[0] as [Record<string, unknown>]
    expect(reqArg.body).toMatchObject({
      discovered_tools: discoveredTools,
    })
  })

  it('passes null discovered_tools when none provided', () => {
    const formData = createTestFormData()
    const { result } = renderHook(() => useCreateIntegration({ handleError: mockHandleError }))

    act(() => {
      result.current(formData)
    })

    expect(mockCreateMutation).toHaveBeenCalledOnce()
    const [reqArg] = mockCreateMutation.mock.calls[0] as [Record<string, unknown>]
    expect(reqArg.body).toMatchObject({
      discovered_tools: null,
    })
  })

  it('passes empty description through to the API', () => {
    const formData = createTestFormData({ description: '' })
    const { result } = renderHook(() => useCreateIntegration({ handleError: mockHandleError }))

    act(() => {
      result.current(formData)
    })

    expect(mockCreateMutation).toHaveBeenCalledOnce()
    const [reqArg] = mockCreateMutation.mock.calls[0] as [Record<string, unknown>]
    expect(reqArg.body).toMatchObject({
      description: '',
    })
  })

  it('passes management_credential_id when provided', () => {
    const formData = createTestFormData({ management_credential_id: 'cred-123' })
    const { result } = renderHook(() => useCreateIntegration({ handleError: mockHandleError }))

    act(() => {
      result.current(formData)
    })

    expect(mockCreateMutation).toHaveBeenCalledOnce()
    const [reqArg] = mockCreateMutation.mock.calls[0] as [Record<string, unknown>]
    expect(reqArg.body).toMatchObject({
      management_credential_id: 'cred-123',
    })
  })

  it('returns a stable function reference across re-renders', () => {
    const { result, rerender } = renderHook(() => useCreateIntegration({ handleError: mockHandleError }))
    const firstRef = result.current

    rerender()

    expect(result.current).toBe(firstRef)
  })

  it('passes discovered_models to the API when provided', () => {
    const formData = createTestFormData({
      integration_type: 'llm_provider',
      configuration: {
        integration_type: 'llm_provider',
        provider_hint: 'red_hat_ai',
        base_url: 'https://api.example.com',
      },
    })
    const discoveredModels = [
      { model_id: 'm1', name: 'model-1', description: null, enabled: true, is_default: true },
      { model_id: 'm2', name: 'model-2', description: null, enabled: true, is_default: false },
    ]
    const { result } = renderHook(() => useCreateIntegration({ handleError: mockHandleError }))

    act(() => {
      result.current(formData, undefined, discoveredModels)
    })

    expect(mockCreateMutation).toHaveBeenCalledOnce()
    const [reqArg] = mockCreateMutation.mock.calls[0] as [Record<string, unknown>]
    expect(reqArg.body).toMatchObject({
      discovered_models: discoveredModels,
      integration_type: 'llm_provider',
    })
  })

  it('passes null discovered_models when none provided for LLM', () => {
    const formData = createTestFormData({
      integration_type: 'llm_provider',
      configuration: {
        integration_type: 'llm_provider',
        provider_hint: 'openai',
        base_url: '',
      },
    })
    const { result } = renderHook(() => useCreateIntegration({ handleError: mockHandleError }))

    act(() => {
      result.current(formData)
    })

    expect(mockCreateMutation).toHaveBeenCalledOnce()
    const [reqArg] = mockCreateMutation.mock.calls[0] as [Record<string, unknown>]
    expect(reqArg.body).toMatchObject({
      discovered_models: null,
    })
  })
})
