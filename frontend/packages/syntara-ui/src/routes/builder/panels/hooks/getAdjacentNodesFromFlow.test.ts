import type { Edge, Node } from '@xyflow/react'
import { describe, expect, it } from 'vitest'

import { getAdjacentNodesFromFlow } from './getAdjacentNodesFromFlow'

function makeNode(id: string, name: string, type = 'script'): Node {
  return {
    id,
    type: 'task',
    position: { x: 0, y: 0 },
    data: { name, type },
  }
}

function makeTriggerNode(index: number, name: string): Node {
  return {
    id: `trigger-${index}`,
    type: 'trigger',
    position: { x: 0, y: 0 },
    data: { name, triggerType: 'manual_trigger' },
  }
}

function makeEdge(source: string, target: string, id?: string): Edge {
  return {
    id: id ?? `${source}->${target}`,
    source,
    target,
    type: 'default',
  }
}

describe('getAdjacentNodesFromFlow', () => {
  it('returns downstream from trigger display id', () => {
    const nodes = [makeTriggerNode(0, 'Manual Trigger'), makeNode('check-value', 'Check Value')]
    const edges = [makeEdge('trigger-0', 'check-value')]

    const result = getAdjacentNodesFromFlow('trigger-0', edges, nodes)

    expect(result.upstream).toEqual([])
    expect(result.downstream).toEqual([{ id: 'check-value', name: 'Check Value', type: 'script' }])
  })

  it('returns upstream trigger display id for activity node', () => {
    const nodes = [makeTriggerNode(0, 'Manual Trigger'), makeNode('check-value', 'Check Value')]
    const edges = [makeEdge('trigger-0', 'check-value')]

    const result = getAdjacentNodesFromFlow('check-value', edges, nodes)

    expect(result.upstream).toEqual([{ id: 'trigger-0', name: 'Manual Trigger', type: 'manual_trigger' }])
  })

  it('returns direct downstream neighbors for branching node', () => {
    const nodes = [
      makeNode('cond-1', 'Branch', 'condition'),
      makeNode('task-a', 'Task A'),
      makeNode('task-b', 'Task B'),
    ]
    const edges = [makeEdge('cond-1', 'task-a'), makeEdge('cond-1', 'task-b')]

    const result = getAdjacentNodesFromFlow('cond-1', edges, nodes)

    expect(result.downstream).toEqual(
      expect.arrayContaining([
        { id: 'task-a', name: 'Task A', type: 'script' },
        { id: 'task-b', name: 'Task B', type: 'script' },
      ])
    )
    expect(result.downstream).toHaveLength(2)
  })

  it('ignores button and placeholder edges', () => {
    const nodes = [makeTriggerNode(0, 'Manual Trigger'), makeNode('check-value', 'Check Value')]
    const edges = [
      makeEdge('trigger-0', 'check-value', 'real-edge'),
      { id: 'button-trigger-0', source: 'trigger-0', target: 'placeholder-trigger-0', type: 'buttonEdge' },
    ]

    const result = getAdjacentNodesFromFlow('trigger-0', edges, nodes)

    expect(result.downstream).toEqual([{ id: 'check-value', name: 'Check Value', type: 'script' }])
  })

  it('does not include transitive ancestors as upstream', () => {
    const nodes = [makeNode('node-a', 'A'), makeNode('node-b', 'B'), makeNode('node-c', 'C')]
    const edges = [makeEdge('node-a', 'node-b'), makeEdge('node-b', 'node-c')]

    const result = getAdjacentNodesFromFlow('node-c', edges, nodes)

    expect(result.upstream).toEqual([{ id: 'node-b', name: 'B', type: 'script' }])
  })
})
