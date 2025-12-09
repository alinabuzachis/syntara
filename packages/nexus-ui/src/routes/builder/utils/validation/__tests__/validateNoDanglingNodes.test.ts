import type { Activity } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'

import type { EdgeConnection } from '../../workflowTransform'
import { validateNoDanglingNodes } from '../rules/validateNoDanglingNodes'

describe('validateNoDanglingNodes', () => {
  it('returns no errors for a fully connected workflow', () => {
    const activities: Activity[] = [
      { type: 'task', id: 'A', name: 'Task A', task: { executor: 'script', config: { language: 'python', code: '' } } },
      { type: 'task', id: 'B', name: 'Task B', task: { executor: 'script', config: { language: 'python', code: '' } } },
      { type: 'task', id: 'C', name: 'Task C', task: { executor: 'script', config: { language: 'python', code: '' } } },
    ]

    const edges: EdgeConnection[] = [
      { id: 'A-B', source: 'A', target: 'B', sourceHandle: 'source', targetHandle: 'target' },
      { id: 'B-C', source: 'B', target: 'C', sourceHandle: 'source', targetHandle: 'target' },
    ]

    const result = validateNoDanglingNodes(activities, edges)
    expect(result).toEqual([])
  })

  it('detects a single dangling node', () => {
    const activities: Activity[] = [
      { type: 'task', id: 'A', name: 'Task A', task: { executor: 'script', config: { language: 'python', code: '' } } },
      { type: 'task', id: 'B', name: 'Task B', task: { executor: 'script', config: { language: 'python', code: '' } } },
      { type: 'task', id: 'C', name: 'Task C', task: { executor: 'script', config: { language: 'python', code: '' } } },
    ]

    const edges: EdgeConnection[] = [
      { id: 'A-B', source: 'A', target: 'B', sourceHandle: 'source', targetHandle: 'target' },
      // C is not connected
    ]

    const result = validateNoDanglingNodes(activities, edges)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      severity: 'error',
      rule: 'no-dangling-nodes',
      nodeId: 'C',
      message: expect.stringContaining('Task C'),
    })
  })

  it('detects multiple dangling nodes', () => {
    const activities: Activity[] = [
      { type: 'task', id: 'A', name: 'Task A', task: { executor: 'script', config: { language: 'python', code: '' } } },
      { type: 'task', id: 'B', name: 'Task B', task: { executor: 'script', config: { language: 'python', code: '' } } },
      { type: 'task', id: 'C', name: 'Task C', task: { executor: 'script', config: { language: 'python', code: '' } } },
    ]

    const edges: EdgeConnection[] = []

    const result = validateNoDanglingNodes(activities, edges)
    // All nodes are dangling when there are no edges
    expect(result).toHaveLength(3)
  })

  it('ignores auto-generated parallel containers', () => {
    const activities: Activity[] = [
      { type: 'task', id: 'A', name: 'Task A', task: { executor: 'script', config: { language: 'python', code: '' } } },
      {
        type: 'parallel',
        id: 'parallel_auto_A',
        name: 'Parallel from A',
        branches: [
          {
            type: 'task',
            id: 'B',
            name: 'Task B',
            task: { executor: 'script', config: { language: 'python', code: '' } },
          },
        ],
      },
    ]

    const edges: EdgeConnection[] = []

    const result = validateNoDanglingNodes(activities, edges)
    // Should only report Task A as dangling, not the parallel_auto_ container
    expect(result).toHaveLength(1)
    expect(result[0].nodeId).toBe('A')
  })

  it('handles complex graph with branches', () => {
    const activities: Activity[] = [
      { type: 'task', id: 'A', name: 'Task A', task: { executor: 'script', config: { language: 'python', code: '' } } },
      { type: 'task', id: 'B', name: 'Task B', task: { executor: 'script', config: { language: 'python', code: '' } } },
      { type: 'task', id: 'C', name: 'Task C', task: { executor: 'script', config: { language: 'python', code: '' } } },
      { type: 'task', id: 'D', name: 'Task D', task: { executor: 'script', config: { language: 'python', code: '' } } },
      { type: 'converge', id: 'E', name: 'Converge E', converge: { strategy: 'all', branches: [] } },
    ]

    const edges: EdgeConnection[] = [
      { id: 'A-B', source: 'A', target: 'B', sourceHandle: 'source', targetHandle: 'target' },
      { id: 'A-C', source: 'A', target: 'C', sourceHandle: 'source', targetHandle: 'target' },
      { id: 'B-E', source: 'B', target: 'E', sourceHandle: 'source', targetHandle: 'target' },
      { id: 'C-E', source: 'C', target: 'E', sourceHandle: 'source', targetHandle: 'target' },
    ]

    const result = validateNoDanglingNodes(activities, edges)
    // D is dangling, all others are connected
    expect(result).toHaveLength(1)
    expect(result[0].nodeId).toBe('D')
  })

  it('handles empty workflow', () => {
    const result = validateNoDanglingNodes([], [])
    expect(result).toEqual([])
  })

  it('handles single node with no edges', () => {
    const activities: Activity[] = [
      { type: 'task', id: 'A', name: 'Task A', task: { executor: 'script', config: { language: 'python', code: '' } } },
    ]

    const result = validateNoDanglingNodes(activities, [])
    // Single isolated node with no edges is dangling
    expect(result).toHaveLength(1)
    expect(result[0].nodeId).toBe('A')
  })
})
