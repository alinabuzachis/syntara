import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MenuNodeType, useNodeMenuActions } from './useNodeMenuActions'

// Mock useReactFlow
const mockDeleteElements = vi.fn()
vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({
    deleteElements: mockDeleteElements,
  }),
}))

describe('useNodeMenuActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('activity nodes', () => {
    it('returns delete action for activity nodes', () => {
      const { result } = renderHook(() =>
        useNodeMenuActions({
          nodeId: 'task-1',
          nodeType: MenuNodeType.ACTIVITY,
        })
      )

      expect(result.current).toHaveLength(1)
      expect(result.current[0].label).toBe('Delete')
      expect(result.current[0].variant).toBe('danger')
    })

    it('calls deleteElements with correct node id for activity node', () => {
      const { result } = renderHook(() =>
        useNodeMenuActions({
          nodeId: 'task-1',
          nodeType: MenuNodeType.ACTIVITY,
        })
      )

      // Click delete
      act(() => {
        result.current[0].onClick()
      })

      // Verify deleteElements was called with correct node id
      expect(mockDeleteElements).toHaveBeenCalledWith({ nodes: [{ id: 'task-1' }] })
    })
  })

  describe('trigger nodes', () => {
    it('returns delete action for trigger nodes', () => {
      const { result } = renderHook(() =>
        useNodeMenuActions({
          nodeId: 'trigger-0',
          nodeType: MenuNodeType.TRIGGER,
          triggerIndex: 0,
        })
      )

      expect(result.current).toHaveLength(1)
      expect(result.current[0].label).toBe('Delete')
      expect(result.current[0].variant).toBe('danger')
    })

    it('calls deleteElements with trigger node id format', () => {
      const { result } = renderHook(() =>
        useNodeMenuActions({
          nodeId: 'trigger-0',
          nodeType: MenuNodeType.TRIGGER,
          triggerIndex: 0,
        })
      )

      // Click delete
      act(() => {
        result.current[0].onClick()
      })

      // Verify deleteElements was called with correct trigger node id
      expect(mockDeleteElements).toHaveBeenCalledWith({ nodes: [{ id: 'trigger-0' }] })
    })

    it('uses triggerIndex to construct node id for triggers', () => {
      const { result } = renderHook(() =>
        useNodeMenuActions({
          nodeId: 'some-other-id',
          nodeType: MenuNodeType.TRIGGER,
          triggerIndex: 2,
        })
      )

      // Click delete
      act(() => {
        result.current[0].onClick()
      })

      // Verify deleteElements uses trigger-{index} format
      expect(mockDeleteElements).toHaveBeenCalledWith({ nodes: [{ id: 'trigger-2' }] })
    })
  })

  describe('additional actions', () => {
    it('includes additional actions before delete', () => {
      const customAction = {
        id: 'duplicate',
        label: 'Duplicate',
        onClick: vi.fn(),
      }

      const { result } = renderHook(() =>
        useNodeMenuActions({
          nodeId: 'task-1',
          nodeType: MenuNodeType.ACTIVITY,
          additionalActions: [customAction],
        })
      )

      // Should have: custom action, separator, delete
      expect(result.current).toHaveLength(3)
      expect(result.current[0].label).toBe('Duplicate')
      expect(result.current[1].separator).toBe(true)
      expect(result.current[2].label).toBe('Delete')
    })

    it('calls additional action onClick when clicked', () => {
      const customOnClick = vi.fn()
      const customAction = {
        id: 'custom-action',
        label: 'Custom Action',
        onClick: customOnClick,
      }

      const { result } = renderHook(() =>
        useNodeMenuActions({
          nodeId: 'task-1',
          nodeType: MenuNodeType.ACTIVITY,
          additionalActions: [customAction],
        })
      )

      // Click custom action
      act(() => {
        result.current[0].onClick()
      })

      expect(customOnClick).toHaveBeenCalledTimes(1)
    })

    it('preserves action icon and variant', () => {
      const icon = '<CustomIcon />'
      const customAction = {
        id: 'custom',
        label: 'Custom',
        onClick: vi.fn(),
        icon,
        variant: 'default' as const,
      }

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
        useNodeMenuActions({
          nodeId: 'task-1',
          nodeType: MenuNodeType.ACTIVITY,
          additionalActions: [],
        })
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
        useNodeMenuActions({
          nodeId: 'task-1',
          nodeType: MenuNodeType.ACTIVITY,
          additionalActions: actions,
        })
      )

      // Should have: 3 custom actions, separator, delete
      expect(result.current).toHaveLength(5)
      expect(result.current[0].label).toBe('Action 1')
      expect(result.current[1].label).toBe('Action 2')
      expect(result.current[2].label).toBe('Action 3')
      expect(result.current[3].separator).toBe(true)
      expect(result.current[4].label).toBe('Delete')
    })
  })
})
