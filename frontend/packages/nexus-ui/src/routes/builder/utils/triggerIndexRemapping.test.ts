import { describe, expect, it } from 'vitest'

import { buildTriggerIndexRemappping, remapTriggerIdsInEdges } from './triggerIndexRemapping'

describe('buildTriggerIndexRemappping', () => {
  it('returns empty map when no triggers are deleted', () => {
    const remap = buildTriggerIndexRemappping(new Set(), 5)
    expect(remap.size).toBe(0)
  })

  it('builds correct mapping when first trigger is deleted', () => {
    const deletedIndices = new Set([0])
    const remap = buildTriggerIndexRemappping(deletedIndices, 3)

    // trigger-1 becomes trigger-0, trigger-2 becomes trigger-1
    expect(remap.get(1)).toBe(0)
    expect(remap.get(2)).toBe(1)
    expect(remap.get(0)).toBeUndefined() // Deleted, no mapping
  })

  it('builds correct mapping when middle trigger is deleted', () => {
    const deletedIndices = new Set([1])
    const remap = buildTriggerIndexRemappping(deletedIndices, 3)

    // trigger-0 stays trigger-0 (not in map), trigger-2 becomes trigger-1
    expect(remap.get(0)).toBeUndefined() // Unchanged, not in map
    expect(remap.get(2)).toBe(1)
  })

  it('builds correct mapping when last trigger is deleted', () => {
    const deletedIndices = new Set([2])
    const remap = buildTriggerIndexRemappping(deletedIndices, 3)

    // trigger-0 and trigger-1 don't change
    expect(remap.size).toBe(0)
  })

  it('builds correct mapping when multiple triggers are deleted', () => {
    const deletedIndices = new Set([0, 2])
    const remap = buildTriggerIndexRemappping(deletedIndices, 5)

    // Original: 0, 1, 2, 3, 4
    // Deleted:  0,    2
    // Result:   1, 3, 4 → 0, 1, 2
    expect(remap.get(1)).toBe(0)
    expect(remap.get(3)).toBe(1)
    expect(remap.get(4)).toBe(2)
  })

  it('only includes indices that actually change', () => {
    const deletedIndices = new Set([2])
    const remap = buildTriggerIndexRemappping(deletedIndices, 3)

    // trigger-0 and trigger-1 don't change, so they shouldn't be in the map
    expect(remap.has(0)).toBe(false)
    expect(remap.has(1)).toBe(false)
  })
})

describe('remapTriggerIdsInEdges', () => {
  it('returns edges unchanged when remap is empty', () => {
    const edges = [
      { id: 'e1', source: 'trigger-0', target: 'node-1' },
      { id: 'e2', source: 'node-1', target: 'trigger-1' },
    ]

    const result = remapTriggerIdsInEdges(edges, new Map())
    expect(result).toEqual(edges)
  })

  it('remaps source trigger IDs', () => {
    const edges = [
      { id: 'e1', source: 'trigger-1', target: 'node-1', sourceHandle: 'source' },
      { id: 'e2', source: 'node-1', target: 'node-2' },
    ]

    const remap = new Map([[1, 0]]) // trigger-1 becomes trigger-0

    const result = remapTriggerIdsInEdges(edges, remap)

    expect(result[0]).toEqual({
      id: 'trigger-0-node-1',
      source: 'trigger-0',
      target: 'node-1',
      sourceHandle: 'source',
    })
    expect(result[1]).toEqual(edges[1]) // Unchanged
  })

  it('remaps target trigger IDs', () => {
    const edges = [
      { id: 'e1', source: 'node-1', target: 'trigger-2' },
      { id: 'e2', source: 'node-2', target: 'node-3' },
    ]

    const remap = new Map([[2, 1]]) // trigger-2 becomes trigger-1

    const result = remapTriggerIdsInEdges(edges, remap)

    expect(result[0]).toEqual({
      id: 'node-1-trigger-1',
      source: 'node-1',
      target: 'trigger-1',
    })
    expect(result[1]).toEqual(edges[1]) // Unchanged
  })

  it('remaps both source and target when both are triggers', () => {
    const edges = [{ id: 'e1', source: 'trigger-1', target: 'trigger-2' }]

    const remap = new Map([
      [1, 0],
      [2, 1],
    ])

    const result = remapTriggerIdsInEdges(edges, remap)

    expect(result[0]).toEqual({
      id: 'trigger-0-trigger-1',
      source: 'trigger-0',
      target: 'trigger-1',
    })
  })

  it('preserves special source handles in edge ID', () => {
    const edges = [{ id: 'e1', source: 'trigger-1', target: 'node-1', sourceHandle: 'true' }]

    const remap = new Map([[1, 0]])

    const result = remapTriggerIdsInEdges(edges, remap)

    expect(result[0]).toEqual({
      id: 'trigger-0-node-1-true',
      source: 'trigger-0',
      target: 'node-1',
      sourceHandle: 'true',
    })
  })

  it('does not add handle suffix for default "source" handle', () => {
    const edges = [{ id: 'e1', source: 'trigger-1', target: 'node-1', sourceHandle: 'source' }]

    const remap = new Map([[1, 0]])

    const result = remapTriggerIdsInEdges(edges, remap)

    expect(result[0].id).toBe('trigger-0-node-1') // No -source suffix
  })

  it('preserves edges that do not reference triggers', () => {
    const edges = [
      { id: 'e1', source: 'node-1', target: 'node-2' },
      { id: 'e2', source: 'node-3', target: 'node-4' },
    ]

    const remap = new Map([[1, 0]])

    const result = remapTriggerIdsInEdges(edges, remap)

    expect(result).toEqual(edges)
  })

  it('only remaps triggers that are in the remap', () => {
    const edges = [
      { id: 'e1', source: 'trigger-0', target: 'node-1' },
      { id: 'e2', source: 'trigger-1', target: 'node-2' },
    ]

    const remap = new Map([[1, 0]]) // Only remap trigger-1

    const result = remapTriggerIdsInEdges(edges, remap)

    expect(result[0]).toEqual(edges[0]) // trigger-0 unchanged (not in remap)
    expect(result[1]).toEqual({
      id: 'trigger-0-node-2',
      source: 'trigger-0',
      target: 'node-2',
    })
  })

  it('handles complex edge object with additional properties', () => {
    const edges = [
      {
        id: 'e1',
        source: 'trigger-1',
        target: 'node-1',
        sourceHandle: 'source',
        targetHandle: 'target',
        type: 'default',
        animated: true,
      },
    ]

    const remap = new Map([[1, 0]])

    const result = remapTriggerIdsInEdges(edges, remap)

    expect(result[0]).toEqual({
      id: 'trigger-0-node-1',
      source: 'trigger-0',
      target: 'node-1',
      sourceHandle: 'source',
      targetHandle: 'target',
      type: 'default',
      animated: true,
    })
  })
})
