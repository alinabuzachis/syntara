import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import {
  useWorkflowVerification,
  resolveNodeId,
  parseValidationMessage,
  extractValidationErrors,
} from './useWorkflowVerification'

const mockShowError = vi.fn()
const mockShowSuccess = vi.fn()
const mockDispatch = vi.fn()
const mockPost = vi.fn()
const mockBuildDefinition = vi.fn<(...args: unknown[]) => Record<string, unknown>>()
const mockGetState = vi.fn<() => Record<string, unknown>>()
const mockSetValidationErrorCount = vi.fn()

vi.mock('../../client', () => ({
  workflowFetchClient: { POST: (...args: unknown[]) => mockPost(...args) as Promise<unknown> },
  authMiddleware: { onRequest: vi.fn() },
  interfaceTagMiddleware: { onRequest: vi.fn() },
}))

vi.mock('../../providers/alerts', () => ({
  useAlerts: () => ({ showError: mockShowError, showSuccess: mockShowSuccess }),
}))

vi.mock('../../stores/useWorkflowStore', () => {
  const store = (selector: (state: Record<string, unknown>) => unknown) => selector({ validationErrorCount: 0 })
  store.getState = () => ({ ...mockGetState(), setValidationErrorCount: mockSetValidationErrorCount })
  return { useWorkflowStore: store }
})

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
      workflow: {
        activities: [
          { type: 'script', id: 'n1', name: 'Step 1', parameters: { language: 'python', code: 'print(1)' } },
        ],
      },
      triggers: [{ type: 'manual_trigger', id: 't1' }],
    },
    edges: [{ id: 'e1', source: 't1', target: 'n1', sourceHandle: 'source', targetHandle: 'target' }],
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
          { message: 'Node A is disconnected', nodeId: 'node-1', severity: 'error' },
          { message: 'Missing condition branch', nodeId: null, severity: 'error' },
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
          { message: 'Workflow must have at least one trigger', nodeId: null, severity: 'error' },
          { message: 'Node config invalid', nodeId: 'node-2', severity: 'error' },
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

  it('uses fallback defaults when workflow has no triggers, name, or description', async () => {
    mockGetState.mockReturnValue({
      currentWorkflow: {
        workflow: { activities: [] },
      },
      edges: [],
      nodePositions: {},
      _positionsUserModified: false,
    })
    mockBuildDefinition.mockReturnValue({ nodes: [], edges: [], triggers: [] })
    mockPost.mockResolvedValue({
      data: { valid: true, errors: [], warnings: [] },
      error: undefined,
      response: { ok: true },
    })

    const { result } = renderVerificationHook()

    act(() => result.current.handleVerify())

    await waitFor(() => {
      expect(mockBuildDefinition).toHaveBeenCalledWith('workflow', '', [], [], {
        edges: [],
        nodePositions: {},
      })
    })
  })

  it('passes nodePositions when _positionsUserModified is true', async () => {
    const positions = { 'node-1': { x: 100, y: 200 } }
    mockGetState.mockReturnValue({
      ...workflowState,
      nodePositions: positions,
      _positionsUserModified: true,
    })
    mockBuildDefinition.mockReturnValue({ nodes: [], edges: [], triggers: [] })
    mockPost.mockResolvedValue({
      data: { valid: true, errors: [], warnings: [] },
      error: undefined,
      response: { ok: true },
    })

    const { result } = renderVerificationHook()

    act(() => result.current.handleVerify())

    await waitFor(() => {
      expect(mockBuildDefinition).toHaveBeenCalledWith(
        'Test',
        'desc',
        workflowState.currentWorkflow.workflow.activities,
        workflowState.currentWorkflow.triggers,
        {
          edges: workflowState.edges,
          nodePositions: positions,
        }
      )
    })
  })

  it('includes nodeName in dispatched errors when 200 response has structured messages', async () => {
    mockGetState.mockReturnValue(workflowState)
    mockBuildDefinition.mockReturnValue({ nodes: [], edges: [], triggers: [] })
    mockPost.mockResolvedValue({
      data: {
        valid: false,
        errors: [
          { message: "{'name': 'Run Job'} Node is disconnected", node_id: 'node-1' },
          { message: 'Missing trigger', node_id: null },
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
          { message: 'Run Job: Node is disconnected', nodeId: 'node-1', nodeName: 'Run Job', severity: 'error' },
          { message: 'Missing trigger', nodeId: null, severity: 'error' },
        ],
      })
    })
  })

  describe('onValid callback', () => {
    it('calls onValid callback when workflow is valid', async () => {
      mockGetState.mockReturnValue(workflowState)
      mockBuildDefinition.mockReturnValue({ nodes: [], edges: [], triggers: [] })
      mockPost.mockResolvedValue({
        data: { valid: true, errors: [], warnings: [] },
        error: undefined,
        response: { ok: true },
      })

      const onValid = vi.fn()
      const { result } = renderVerificationHook()

      act(() => result.current.handleVerify(onValid))

      await waitFor(() => {
        expect(onValid).toHaveBeenCalledTimes(1)
        expect(mockShowSuccess).not.toHaveBeenCalled()
      })
    })

    it('shows success toast when no onValid callback provided', async () => {
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
        expect(mockShowSuccess).toHaveBeenCalledWith({ title: 'Workflow definition is valid' })
      })
    })

    it('does not call onValid when workflow is invalid', async () => {
      mockGetState.mockReturnValue(workflowState)
      mockBuildDefinition.mockReturnValue({ nodes: [], edges: [], triggers: [] })
      mockPost.mockResolvedValue({
        data: {
          valid: false,
          errors: [{ message: 'Error', node_id: null }],
          warnings: [],
        },
        error: undefined,
        response: { ok: true },
      })

      const onValid = vi.fn()
      const { result } = renderVerificationHook()

      act(() => result.current.handleVerify(onValid))

      await waitFor(() => {
        expect(onValid).not.toHaveBeenCalled()
      })
    })
  })

  describe('validationErrorCount store updates', () => {
    it('sets validationErrorCount to 0 on valid response', async () => {
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
        expect(mockSetValidationErrorCount).toHaveBeenCalledWith(0)
      })
    })

    it('sets validationErrorCount on invalid response', async () => {
      mockGetState.mockReturnValue(workflowState)
      mockBuildDefinition.mockReturnValue({ nodes: [], edges: [], triggers: [] })
      mockPost.mockResolvedValue({
        data: {
          valid: false,
          errors: [{ message: 'Error', node_id: null }],
          warnings: [],
        },
        error: undefined,
        response: { ok: true },
      })

      const { result } = renderVerificationHook()

      act(() => result.current.handleVerify())

      await waitFor(() => {
        expect(mockSetValidationErrorCount).toHaveBeenCalledWith(1)
      })
    })

    it('sets validationErrorCount on error with validation_result', async () => {
      mockGetState.mockReturnValue(workflowState)
      mockBuildDefinition.mockReturnValue({ nodes: [], edges: [], triggers: [] })
      mockPost.mockResolvedValue({
        data: undefined,
        error: {
          validation_result: {
            errors: [{ message: 'Error', node_id: null }],
          },
        },
        response: { ok: false },
      })

      const { result } = renderVerificationHook()

      act(() => result.current.handleVerify())

      await waitFor(() => {
        expect(mockSetValidationErrorCount).toHaveBeenCalledWith(1)
      })
    })

    it('resets validationErrorCount on error without validation_result', async () => {
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
        expect(mockSetValidationErrorCount).toHaveBeenCalledWith(0)
        expect(mockDispatch).toHaveBeenCalledWith({ type: 'CLEAR_VALIDATION_ERRORS' })
        expect(mockShowError).toHaveBeenCalledWith({
          title: 'Verification failed',
          description: 'Unknown error',
        })
      })
    })

    it('returns validationErrorCount from the store', () => {
      const { result } = renderVerificationHook()

      expect(result.current.validationErrorCount).toBe(0)
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

describe('parseValidationMessage', () => {
  it('extracts message and nodeName from structured message', () => {
    expect(parseValidationMessage("{'name': 'MyNode'} Node is disconnected")).toEqual({
      message: 'MyNode: Node is disconnected',
      nodeName: 'MyNode',
    })
  })

  it('returns raw message without nodeName when format does not match', () => {
    expect(parseValidationMessage('Node A is disconnected')).toEqual({
      message: 'Node A is disconnected',
    })
  })

  it('returns raw message when name matches but suffix does not', () => {
    expect(parseValidationMessage("{'name': 'MyNode'}")).toEqual({
      message: "{'name': 'MyNode'}",
    })
  })

  it('extracts name with spaces and special characters', () => {
    expect(parseValidationMessage("{'name': 'My Node - v2'} has invalid config")).toEqual({
      message: 'My Node - v2: has invalid config',
      nodeName: 'My Node - v2',
    })
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
      { message: 'Error 1', nodeId: 'node-1', severity: 'error' },
      { message: 'Error 2', nodeId: null, severity: 'error' },
    ])
  })

  it('returns null when no validation_result', () => {
    expect(extractValidationErrors({ title: 'Error' })).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(extractValidationErrors(undefined)).toBeNull()
  })

  it('returns null when validation_result has empty errors array', () => {
    expect(extractValidationErrors({ validation_result: { errors: [] } })).toBeNull()
  })

  it('returns null when validation_result has no errors field', () => {
    expect(extractValidationErrors({ validation_result: { valid: false } })).toBeNull()
  })

  it('extracts nodeName from structured Python-dict messages', () => {
    const err = {
      validation_result: {
        errors: [{ message: "{'name': 'Run Job'} Node is disconnected", node_id: 'node-5' }],
      },
    }
    const result = extractValidationErrors(err)
    expect(result).toEqual([
      { message: 'Run Job: Node is disconnected', nodeId: 'node-5', nodeName: 'Run Job', severity: 'error' },
    ])
  })
})

describe('verification of incomplete nodes', () => {
  function renderVerificationHook() {
    return renderHook(() => useWorkflowVerification({ dispatch: mockDispatch }))
  }

  const workflowWithNodes = {
    currentWorkflow: {
      name: 'Test',
      description: 'desc',
      workflow: {
        activities: [
          { id: 'script-1', name: 'Empty Script', type: 'script', parameters: {} },
          { id: 'script-2', name: 'Empty Script2', type: 'script', parameters: {} },
        ],
      },
      triggers: [{ id: 'trigger-1', type: 'manual_trigger', parameters: {} }],
    },
    edges: [
      { id: 'e1', source: 'trigger-1', target: 'script-1' },
      { id: 'e2', source: 'script-1', target: 'script-2' },
    ],
    nodePositions: {},
    _positionsUserModified: false,
  }

  it('dispatches per-node errors for multiple incomplete nodes', async () => {
    mockGetState.mockReturnValue(workflowWithNodes)
    mockBuildDefinition.mockReturnValue({ nodes: [], edges: [], triggers: [] })
    mockPost.mockResolvedValue({
      data: {
        valid: false,
        errors: [
          { message: 'Node configuration is incomplete', node_id: 'script-1' },
          { message: 'Node configuration is incomplete', node_id: 'script-2' },
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
          {
            message: 'Node configuration is incomplete',
            nodeId: 'script-1',
            nodeName: 'Empty Script',
            severity: 'error',
          },
          {
            message: 'Node configuration is incomplete',
            nodeId: 'script-2',
            nodeName: 'Empty Script2',
            severity: 'error',
          },
        ],
      })
      expect(mockSetValidationErrorCount).toHaveBeenCalledWith(2)
    })
  })

  it('dispatches errors and warnings separately for incomplete nodes', async () => {
    mockGetState.mockReturnValue(workflowWithNodes)
    mockBuildDefinition.mockReturnValue({ nodes: [], edges: [], triggers: [] })
    mockPost.mockResolvedValue({
      data: {
        valid: false,
        errors: [{ message: 'Missing required field: code', node_id: 'script-1' }],
        warnings: [{ message: 'Script has no error handling', node_id: 'script-2' }],
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
          { message: 'Missing required field: code', nodeId: 'script-1', nodeName: 'Empty Script', severity: 'error' },
          {
            message: 'Script has no error handling',
            nodeId: 'script-2',
            nodeName: 'Empty Script2',
            severity: 'warning',
          },
        ],
      })
      expect(mockSetValidationErrorCount).toHaveBeenCalledWith(2)
    })
  })

  it('sets validationErrorCount to total number of issues from backend', async () => {
    mockGetState.mockReturnValue(workflowWithNodes)
    mockBuildDefinition.mockReturnValue({ nodes: [], edges: [], triggers: [] })
    mockPost.mockResolvedValue({
      data: {
        valid: false,
        errors: [
          { message: 'Error 1', node_id: 'script-1' },
          { message: 'Error 2', node_id: 'script-2' },
          { message: 'Global error', node_id: null },
        ],
        warnings: [],
      },
      error: undefined,
      response: { ok: true },
    })

    const { result } = renderVerificationHook()

    act(() => result.current.handleVerify())

    await waitFor(() => {
      expect(mockSetValidationErrorCount).toHaveBeenCalledWith(3)
    })
  })
})
