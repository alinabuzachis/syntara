import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import {
  useWorkflowVerification,
  resolveNodeId,
  formatValidationMessage,
  extractValidationErrors,
} from './useWorkflowVerification'

const mockShowError = vi.fn()
const mockShowSuccess = vi.fn()
const mockDispatch = vi.fn()
const mockPost = vi.fn()
const mockBuildDefinition = vi.fn<(...args: unknown[]) => Record<string, unknown>>()
const mockGetState = vi.fn<() => Record<string, unknown>>()

vi.mock('../../client', () => ({
  workflowFetchClient: { POST: (...args: unknown[]) => mockPost(...args) as Promise<unknown> },
}))

vi.mock('../../providers/alerts', () => ({
  useAlerts: () => ({ showError: mockShowError, showSuccess: mockShowSuccess }),
}))

vi.mock('../../stores/useWorkflowStore', () => ({
  useWorkflowStore: {
    getState: () => mockGetState(),
  },
}))

vi.mock('../../utils/apiErrors', () => ({
  getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : 'Unknown error'),
}))

vi.mock('./utils/workflowDefinitionBuilder', () => ({
  buildWorkflowDefinition: (...args: unknown[]) => mockBuildDefinition(...args),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockGetState.mockReturnValue({
    currentWorkflow: null,
    edges: [],
  })
})

describe('useWorkflowVerification', () => {
  function renderVerificationHook() {
    return renderHook(() => useWorkflowVerification({ dispatch: mockDispatch }))
  }

  const workflowState = {
    currentWorkflow: {
      name: 'Test',
      description: 'desc',
      workflow: { activities: [] },
      triggers: [],
    },
    edges: [],
    nodePositions: {},
    _positionsUserModified: false,
  }

  it('closes kebab when no current workflow', () => {
    const { result } = renderVerificationHook()

    act(() => result.current.handleVerify())

    expect(mockDispatch).toHaveBeenCalledWith({ type: 'SET_KEBAB_OPEN', payload: false })
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('clears stale validation errors before starting verification', async () => {
    mockGetState.mockReturnValue(workflowState)
    mockBuildDefinition.mockReturnValue({ nodes: [], edges: [], triggers: [] })
    mockPost.mockResolvedValue({
      data: { valid: true, errors: [], warnings: [] },
      error: undefined,
      response: { ok: true },
    })

    const { result } = renderVerificationHook()

    act(() => result.current.handleVerify())

    const clearCall = mockDispatch.mock.calls.find(
      (call) => (call[0] as { type: string }).type === 'CLEAR_VALIDATION_ERRORS'
    )
    expect(clearCall).toBeDefined()

    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalledWith({ title: 'Workflow definition is valid' })
    })
  })

  it('clears validation errors and shows success alert when workflow is valid', async () => {
    mockGetState.mockReturnValue(workflowState)
    mockBuildDefinition.mockReturnValue({ nodes: [], edges: [], triggers: [] })
    mockPost.mockResolvedValue({
      data: { valid: true, errors: [], warnings: [] },
      error: undefined,
      response: { ok: true },
    })

    const { result } = renderVerificationHook()

    act(() => result.current.handleVerify())

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith({ type: 'CLEAR_VALIDATION_ERRORS' })
      expect(mockShowSuccess).toHaveBeenCalledWith({ title: 'Workflow definition is valid' })
    })
  })

  it('dispatches validation errors when workflow is invalid via 200', async () => {
    mockGetState.mockReturnValue(workflowState)
    mockBuildDefinition.mockReturnValue({ nodes: [], edges: [], triggers: [] })
    mockPost.mockResolvedValue({
      data: {
        valid: false,
        errors: [
          { message: 'Node A is disconnected', node_id: 'node-1' },
          { message: 'Missing condition branch', node_id: null },
        ],
        warnings: [],
      },
      error: undefined,
      response: { ok: true },
    })

    const { result } = renderVerificationHook()

    act(() => result.current.handleVerify())

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'SET_VALIDATION_ERRORS',
        payload: [
          { message: 'Node A is disconnected', nodeId: 'node-1' },
          { message: 'Missing condition branch', nodeId: null },
        ],
      })
      expect(mockShowError).not.toHaveBeenCalled()
    })
  })

  it('dispatches validation errors from 400 response with validation_result', async () => {
    mockGetState.mockReturnValue(workflowState)
    mockBuildDefinition.mockReturnValue({ nodes: [], edges: [], triggers: [] })
    mockPost.mockResolvedValue({
      data: undefined,
      error: {
        type: 'https://api.nexus.com/errors/validation-error',
        title: 'Workflow Definition Invalid',
        detail: 'The workflow definition failed validation',
        code: 'WORKFLOW_DEFINITION_INVALID',
        retryable: false,
        validation_result: {
          valid: false,
          errors: [
            { message: 'Workflow must have at least one trigger', node_id: null },
            { message: 'Node config invalid', node_id: 'node-2' },
          ],
          warnings: [],
        },
      },
      response: { ok: false },
    })

    const { result } = renderVerificationHook()

    act(() => result.current.handleVerify())

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'SET_VALIDATION_ERRORS',
        payload: [
          { message: 'Workflow must have at least one trigger', nodeId: null },
          { message: 'Node config invalid', nodeId: 'node-2' },
        ],
      })
    })
  })

  it('shows error toast when 400 response has no validation_result', async () => {
    mockGetState.mockReturnValue(workflowState)
    mockBuildDefinition.mockReturnValue({ nodes: [], edges: [], triggers: [] })
    mockPost.mockResolvedValue({
      data: undefined,
      error: {
        title: 'Server Error',
        detail: 'Internal server error',
      },
      response: { ok: false },
    })

    const { result } = renderVerificationHook()

    act(() => result.current.handleVerify())

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith({
        title: 'Verification failed',
        description: 'Unknown error',
      })
    })
  })

  it('shows error when build definition throws', () => {
    mockGetState.mockReturnValue(workflowState)
    mockBuildDefinition.mockImplementation(() => {
      throw new Error('Name is required')
    })

    const { result } = renderVerificationHook()

    act(() => result.current.handleVerify())

    expect(mockShowError).toHaveBeenCalledWith({
      title: 'Verification failed',
      description: 'Name is required',
    })
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('shows error when fetch rejects', async () => {
    mockGetState.mockReturnValue(workflowState)
    mockBuildDefinition.mockReturnValue({ nodes: [], edges: [], triggers: [] })
    mockPost.mockRejectedValue(new Error('Network error'))

    const { result } = renderVerificationHook()

    act(() => result.current.handleVerify())

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith({
        title: 'Verification failed',
        description: 'Network error',
      })
    })
  })
})

describe('resolveNodeId', () => {
  it('returns node_id when present', () => {
    expect(resolveNodeId({ message: 'error', node_id: 'node-1' })).toBe('node-1')
  })

  it('extracts node ID from message when node_id is null', () => {
    expect(resolveNodeId({ message: "{'id': 'node-42'} is broken", node_id: null })).toBe('node-42')
  })

  it('returns null when neither source has an ID', () => {
    expect(resolveNodeId({ message: 'global error', node_id: null })).toBeNull()
  })
})

describe('formatValidationMessage', () => {
  it('extracts node name and error suffix from structured message', () => {
    expect(formatValidationMessage("{'name': 'MyNode'} Node is disconnected")).toBe('MyNode: Node is disconnected')
  })

  it('returns raw message when format does not match', () => {
    expect(formatValidationMessage('Node A is disconnected')).toBe('Node A is disconnected')
  })
})

describe('extractValidationErrors', () => {
  it('extracts errors from validation_result', () => {
    const err = {
      validation_result: {
        errors: [
          { message: 'Error 1', node_id: 'node-1' },
          { message: 'Error 2', node_id: null },
        ],
      },
    }
    const result = extractValidationErrors(err)
    expect(result).toEqual([
      { message: 'Error 1', nodeId: 'node-1' },
      { message: 'Error 2', nodeId: null },
    ])
  })

  it('returns null when no validation_result', () => {
    expect(extractValidationErrors({ title: 'Error' })).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(extractValidationErrors(undefined)).toBeNull()
  })
})
