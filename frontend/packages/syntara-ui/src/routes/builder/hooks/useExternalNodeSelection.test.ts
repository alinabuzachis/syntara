import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { NodeType } from '../../workflows/canvas/nodes/NodeType'

import { useExternalNodeSelection } from './useExternalNodeSelection'

function makeNode(id: string, selected = false, data: Record<string, unknown> = {}): NodeType {
  return { id, selected, data, position: { x: 0, y: 0 }, type: 'task' } as unknown as NodeType
}

describe('useExternalNodeSelection', () => {
  it('does nothing when selectedActivityId is null', () => {
    const setNodes = vi.fn()
    renderHook(() => useExternalNodeSelection(null, setNodes))

    expect(setNodes).not.toHaveBeenCalled()
  })

  it('does nothing when selectedActivityId is undefined', () => {
    const setNodes = vi.fn()
    renderHook(() => useExternalNodeSelection(undefined, setNodes))

    expect(setNodes).not.toHaveBeenCalled()
  })

  it('selects node matching by id', () => {
    const setNodes = vi.fn()
    renderHook(() => useExternalNodeSelection('step-1', setNodes))

    expect(setNodes).toHaveBeenCalled()
    const updater = setNodes.mock.calls[0][0] as (prev: NodeType[]) => NodeType[]
    const result = updater([makeNode('step-1'), makeNode('step-2')])

    expect(result[0].selected).toBe(true)
    expect(result[1].selected).toBe(false)
  })

  it('selects node matching by definitionId', () => {
    const setNodes = vi.fn()
    renderHook(() => useExternalNodeSelection('trigger_manual', setNodes))

    const updater = setNodes.mock.calls[0][0] as (prev: NodeType[]) => NodeType[]
    const result = updater([makeNode('trigger-0', false, { definitionId: 'trigger_manual' }), makeNode('step-1')])

    expect(result[0].selected).toBe(true)
    expect(result[1].selected).toBe(false)
  })

  it('returns same node reference when selected state unchanged', () => {
    const setNodes = vi.fn()
    renderHook(() => useExternalNodeSelection('step-1', setNodes))

    const node = makeNode('step-1', true)
    const updater = setNodes.mock.calls[0][0] as (prev: NodeType[]) => NodeType[]
    const result = updater([node])

    expect(result[0]).toBe(node)
  })
})
