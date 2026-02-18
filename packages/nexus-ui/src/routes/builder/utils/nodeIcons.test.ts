import type { ComponentType } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { getCanvasNodeIconDescriptor } from '../../automations/canvas/nodes/nodeIconResolver'
import { NodeRegistry } from '../registry/NodeRegistry'

import { resolveIconForNode, resolveIconForType } from './nodeIcons'

vi.mock('../registry/NodeRegistry', () => ({
  NodeRegistry: {
    getAll: vi.fn(),
  },
}))

vi.mock('../../automations/canvas/nodes/nodeIconResolver', () => ({
  getCanvasNodeIconDescriptor: vi.fn(),
}))

describe('nodeIcons', () => {
  const IconA: ComponentType = () => null
  const IconB: ComponentType = () => null

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves icons for registry node types and subtypes', () => {
    vi.mocked(NodeRegistry.getAll).mockReturnValue([
      {
        id: 'action',
        icon: IconA,
        subtypes: [{ id: 'action-script', icon: IconB }],
      },
    ] as never[])

    expect(resolveIconForType({ nodeTypeId: 'action' })).toEqual({ icon: IconA, id: 'action' })
    expect(resolveIconForType({ nodeTypeId: 'action', nodeSubtypeId: 'action-script' })).toEqual({
      icon: IconB,
      id: 'action-script',
    })
  })

  it('returns undefined icon when no registry match is found', () => {
    vi.mocked(NodeRegistry.getAll).mockReturnValue([] as never[])

    expect(resolveIconForType({ nodeTypeId: 'missing' })).toEqual({ icon: undefined, id: 'missing' })
    expect(resolveIconForType({ nodeTypeId: null, nodeSubtypeId: null })).toEqual({ icon: undefined, id: undefined })
  })

  it('delegates node icon resolution to the canvas resolver', () => {
    vi.mocked(getCanvasNodeIconDescriptor).mockReturnValue({ icon: IconA, id: 'logic-condition' })

    const result = resolveIconForNode(
      {
        id: 'condition-1',
        type: 'condition',
        data: { id: 'condition-1', type: 'condition' },
      } as never,
      { triggers: [] }
    )

    expect(getCanvasNodeIconDescriptor).toHaveBeenCalled()
    expect(result).toEqual({ icon: IconA, id: 'logic-condition' })
  })
})
