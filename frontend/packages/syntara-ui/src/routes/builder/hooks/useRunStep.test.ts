import { renderHook, act } from '@testing-library/react'
import type { ReactFlowInstance } from '@xyflow/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { useWorkflowStore } from '../../../stores/useWorkflowStore'
import type { RunStepDialogData as TestStepDialogData } from '../components/RunStepDialog'

import { useRunStep } from './useRunStep'

vi.mock('../../../utils/graphTraversal', () => ({
  getAncestorNodes: vi.fn(() => [{ id: 'ancestor-1', data: { name: 'Step 1' } }]),
}))

function createMockReactFlow(nodeData?: Record<string, unknown>): ReactFlowInstance {
  return {
    getNode: vi.fn((id: string) => (nodeData ? { id, data: nodeData } : undefined)),
    getEdges: vi.fn(() => []),
    getNodes: vi.fn(() => []),
  } as unknown as ReactFlowInstance
}

describe('useRunStep', () => {
  let openTestStepDialog: ReturnType<typeof vi.fn<(data: TestStepDialogData) => void>>
  let handleSaveWorkflow: ReturnType<typeof vi.fn<() => Promise<boolean>>>

  beforeEach(() => {
    openTestStepDialog = vi.fn()
    handleSaveWorkflow = vi.fn().mockResolvedValue(true)
  })

  it('returns early when node data is falsy', async () => {
    const reactFlowInstance = createMockReactFlow()

    const { result } = renderHook(() => useRunStep({ reactFlowInstance, openTestStepDialog, handleSaveWorkflow }))

    await act(async () => {
      await result.current('nonexistent-node')
    })

    expect(openTestStepDialog).not.toHaveBeenCalled()
  })

  it('opens test step dialog with node info and ancestors', async () => {
    const reactFlowInstance = createMockReactFlow({ name: 'My Node' })

    const { result } = renderHook(() => useRunStep({ reactFlowInstance, openTestStepDialog, handleSaveWorkflow }))

    await act(async () => {
      await result.current('node-1')
    })

    expect(openTestStepDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: 'node-1',
        nodeName: 'My Node',
      })
    )
  })

  it('saves workflow before opening dialog when dirty', async () => {
    const reactFlowInstance = createMockReactFlow({ name: 'My Node' })
    useWorkflowStore.setState({ isDirty: true })

    const { result } = renderHook(() => useRunStep({ reactFlowInstance, openTestStepDialog, handleSaveWorkflow }))

    await act(async () => {
      await result.current('node-1')
    })

    expect(handleSaveWorkflow).toHaveBeenCalled()
    expect(openTestStepDialog).toHaveBeenCalled()
  })

  it('aborts when save fails', async () => {
    const reactFlowInstance = createMockReactFlow({ name: 'My Node' })
    useWorkflowStore.setState({ isDirty: true })
    handleSaveWorkflow.mockResolvedValue(false)

    const { result } = renderHook(() => useRunStep({ reactFlowInstance, openTestStepDialog, handleSaveWorkflow }))

    await act(async () => {
      await result.current('node-1')
    })

    expect(handleSaveWorkflow).toHaveBeenCalled()
    expect(openTestStepDialog).not.toHaveBeenCalled()
  })

  it('uses node id as fallback name when name is missing', async () => {
    const reactFlowInstance = createMockReactFlow({})

    const { result } = renderHook(() => useRunStep({ reactFlowInstance, openTestStepDialog, handleSaveWorkflow }))

    await act(async () => {
      await result.current('node-1')
    })

    expect(openTestStepDialog).toHaveBeenCalledWith(expect.objectContaining({ nodeName: 'node-1' }))
  })
})
