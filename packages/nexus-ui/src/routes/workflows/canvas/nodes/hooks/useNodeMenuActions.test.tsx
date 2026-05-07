import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NodeActionsContext, type NodeActionsContextValue } from '../../../../../routes/builder/NodeActionsContext'
import { useWorkflowStore } from '../../../../../stores/useWorkflowStore'

import { MenuNodeType, useNodeMenuActions } from './useNodeMenuActions'

// Mock useReactFlow
const mockDeleteElements = vi.fn()
vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({
    deleteElements: mockDeleteElements,
  }),
  useUpdateNodeInternals: () => vi.fn(),
}))

// Mock alerts
const mockShowInfo = vi.fn()
const mockShowError = vi.fn()
vi.mock('../../../../../components/alerts', () => ({
  useAlerts: () => ({
    showInfo: mockShowInfo,
    showSuccess: vi.fn(),
    showError: mockShowError,
  }),
}))

// Helper: wrap hook in NodeActionsContext
function withNodeActions(value: NodeActionsContextValue) {
  return ({ children }: { children: ReactNode }) => (
    <NodeActionsContext.Provider value={value}>{children}</NodeActionsContext.Provider>
  )
}

const mockOnViewDetails = vi.fn()
const mockOnReplace = vi.fn()
const mockOnDuplicate = vi.fn()
const mockOnRunStep = vi.fn()
const defaultNodeActions: NodeActionsContextValue = {
  onViewDetails: mockOnViewDetails,
  onReplace: mockOnReplace,
  onDuplicate: mockOnDuplicate,
  onRunStep: mockOnRunStep,
}

describe('useNodeMenuActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDeleteElements.mockResolvedValue(undefined)
    useWorkflowStore.setState({ currentWorkflow: null, workflowVersion: 0, edges: [] })
  })

  describe('without NodeActionsContext (outside builder)', () => {
    it('returns only delete action for activity nodes', () => {
      const { result } = renderHook(() => useNodeMenuActions({ nodeId: 'task-1', nodeType: MenuNodeType.ACTIVITY }))

      expect(result.current).toHaveLength(1)
      expect(result.current[0].label).toBe('Delete')
      expect(result.current[0].variant).toBe('danger')
    })

    it('returns only delete action for trigger nodes', () => {
      const { result } = renderHook(() =>
        useNodeMenuActions({ nodeId: 'trigger-0', nodeType: MenuNodeType.TRIGGER, triggerIndex: 0 })
      )

      expect(result.current).toHaveLength(1)
      expect(result.current[0].label).toBe('Delete')
    })

    it('calls deleteElements with correct node id for activity node', () => {
      const { result } = renderHook(() => useNodeMenuActions({ nodeId: 'task-1', nodeType: MenuNodeType.ACTIVITY }))

      act(() => {
        result.current[0].onClick()
      })

      expect(mockDeleteElements).toHaveBeenCalledWith({ nodes: [{ id: 'task-1' }] })
    })

    it('notifies when deleteElements rejects', async () => {
      mockDeleteElements.mockRejectedValueOnce(new Error('delete failed'))
      const { result } = renderHook(() => useNodeMenuActions({ nodeId: 'task-1', nodeType: MenuNodeType.ACTIVITY }))

      act(() => {
        result.current[0].onClick()
      })

      await waitFor(() => {
        expect(mockShowError).toHaveBeenCalledWith({ title: 'Could not delete step', description: 'delete failed' })
      })
    })

    it('calls deleteElements with trigger node id format', () => {
      const { result } = renderHook(() =>
        useNodeMenuActions({ nodeId: 'trigger-0', nodeType: MenuNodeType.TRIGGER, triggerIndex: 0 })
      )

      act(() => {
        result.current[0].onClick()
      })

      expect(mockDeleteElements).toHaveBeenCalledWith({ nodes: [{ id: 'trigger-0' }] })
    })

    it('uses triggerIndex to construct node id for triggers', () => {
      const { result } = renderHook(() =>
        useNodeMenuActions({ nodeId: 'some-other-id', nodeType: MenuNodeType.TRIGGER, triggerIndex: 2 })
      )

      act(() => {
        result.current[0].onClick()
      })

      expect(mockDeleteElements).toHaveBeenCalledWith({ nodes: [{ id: 'trigger-2' }] })
    })
  })

  describe('with NodeActionsContext (inside builder) — activity nodes', () => {
    it('returns view details, run step, duplicate, replace, separator, delete for activity nodes', () => {
      const { result } = renderHook(() => useNodeMenuActions({ nodeId: 'task-1', nodeType: MenuNodeType.ACTIVITY }), {
        wrapper: withNodeActions(defaultNodeActions),
      })

      const labels = result.current.map((a) => a.label)
      expect(labels).toEqual(['View step details', 'Run step', 'Duplicate', 'Replace', 'Delete'])
    })

    it('calls onViewDetails with the node id', () => {
      const { result } = renderHook(() => useNodeMenuActions({ nodeId: 'task-1', nodeType: MenuNodeType.ACTIVITY }), {
        wrapper: withNodeActions(defaultNodeActions),
      })

      const viewDetails = result.current.find((a) => a.id === 'view-details')
      expect(viewDetails?.label).toBe('View step details')
      act(() => {
        viewDetails?.onClick()
      })

      expect(mockOnViewDetails).toHaveBeenCalledWith('task-1')
    })

    it('calls onRunStep for run step', () => {
      const { result } = renderHook(() => useNodeMenuActions({ nodeId: 'task-1', nodeType: MenuNodeType.ACTIVITY }), {
        wrapper: withNodeActions(defaultNodeActions),
      })

      const runStep = result.current.find((a) => a.id === 'run-step')
      act(() => {
        runStep?.onClick()
      })

      expect(mockOnRunStep).toHaveBeenCalledWith('task-1')
    })

    it('calls onReplace with the node id', () => {
      const { result } = renderHook(() => useNodeMenuActions({ nodeId: 'task-1', nodeType: MenuNodeType.ACTIVITY }), {
        wrapper: withNodeActions(defaultNodeActions),
      })

      const replace = result.current.find((a) => a.id === 'replace')
      act(() => {
        replace?.onClick()
      })

      expect(mockOnReplace).toHaveBeenCalledWith('task-1')
    })

    it('duplicate action delegates to nodeActions.onDuplicate', () => {
      const { result } = renderHook(() => useNodeMenuActions({ nodeId: 'task-1', nodeType: MenuNodeType.ACTIVITY }), {
        wrapper: withNodeActions(defaultNodeActions),
      })

      const duplicate = result.current.find((a) => a.id === 'duplicate')
      act(() => {
        duplicate?.onClick()
      })

      expect(mockOnDuplicate).toHaveBeenCalledWith('task-1')
    })

    it('delete action is last and has danger variant', () => {
      const { result } = renderHook(() => useNodeMenuActions({ nodeId: 'task-1', nodeType: MenuNodeType.ACTIVITY }), {
        wrapper: withNodeActions(defaultNodeActions),
      })

      const last = result.current[result.current.length - 1]
      expect(last.id).toBe('delete')
      expect(last.variant).toBe('danger')
    })

    it('delete is the last action with no separator', () => {
      const { result } = renderHook(() => useNodeMenuActions({ nodeId: 'task-1', nodeType: MenuNodeType.ACTIVITY }), {
        wrapper: withNodeActions(defaultNodeActions),
      })

      const actions = result.current
      expect(actions.every((a) => !a.separator)).toBe(true)
    })
  })

  describe('with NodeActionsContext — trigger nodes', () => {
    it('returns view details and delete but NOT run step, duplicate, or replace for trigger nodes', () => {
      const { result } = renderHook(
        () => useNodeMenuActions({ nodeId: 'trigger-0', nodeType: MenuNodeType.TRIGGER, triggerIndex: 0 }),
        { wrapper: withNodeActions(defaultNodeActions) }
      )

      const ids = result.current.map((a) => a.id)
      expect(ids).toContain('view-details')
      expect(ids).not.toContain('replace')
      expect(ids).not.toContain('run-step')
      expect(ids).not.toContain('duplicate')
      expect(ids).toContain('delete')
    })
  })

  describe('additional actions (legacy prop)', () => {
    it('includes additional actions before delete', () => {
      const customAction = { id: 'custom', label: 'Custom', onClick: vi.fn() }

      const { result } = renderHook(() =>
        useNodeMenuActions({
          nodeId: 'task-1',
          nodeType: MenuNodeType.ACTIVITY,
          additionalActions: [customAction],
        })
      )

      // Without context: custom action, delete (no separator)
      expect(result.current).toHaveLength(2)
      expect(result.current[0].label).toBe('Custom')
      expect(result.current[1].label).toBe('Delete')
    })

    it('calls additional action onClick when clicked', () => {
      const customOnClick = vi.fn()
      const customAction = { id: 'custom-action', label: 'Custom Action', onClick: customOnClick }

      const { result } = renderHook(() =>
        useNodeMenuActions({
          nodeId: 'task-1',
          nodeType: MenuNodeType.ACTIVITY,
          additionalActions: [customAction],
        })
      )

      act(() => {
        result.current[0].onClick()
      })

      expect(customOnClick).toHaveBeenCalledTimes(1)
    })

    it('preserves action icon and variant', () => {
      const icon = '<CustomIcon />'
      const customAction = { id: 'custom', label: 'Custom', onClick: vi.fn(), icon, variant: 'default' as const }

      const { result } = renderHook(() =>
        useNodeMenuActions({
          nodeId: 'task-1',
          nodeType: MenuNodeType.ACTIVITY,
          additionalActions: [customAction],
        })
      )

      expect(result.current[0].icon).toBe(icon)
      expect(result.current[0].variant).toBe('default')
    })
  })

  describe('edge cases', () => {
    it('returns only delete action when additionalActions is empty array', () => {
      const { result } = renderHook(() =>
        useNodeMenuActions({ nodeId: 'task-1', nodeType: MenuNodeType.ACTIVITY, additionalActions: [] })
      )

      expect(result.current).toHaveLength(1)
      expect(result.current[0].label).toBe('Delete')
    })

    it('handles multiple additional actions', () => {
      const actions = [
        { id: 'action-1', label: 'Action 1', onClick: vi.fn() },
        { id: 'action-2', label: 'Action 2', onClick: vi.fn() },
        { id: 'action-3', label: 'Action 3', onClick: vi.fn() },
      ]

      const { result } = renderHook(() =>
        useNodeMenuActions({ nodeId: 'task-1', nodeType: MenuNodeType.ACTIVITY, additionalActions: actions })
      )

      // Should have: 3 custom actions, delete (no separator)
      expect(result.current).toHaveLength(4)
      expect(result.current[0].label).toBe('Action 1')
      expect(result.current[1].label).toBe('Action 2')
      expect(result.current[2].label).toBe('Action 3')
      expect(result.current[3].label).toBe('Delete')
    })
  })
})
