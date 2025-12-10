import type { Activity } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'

import { validateNoGenericNodes } from './validateNoGenericNodes'

describe('validateNoGenericNodes', () => {
  it('returns no errors for workflow without generic nodes', () => {
    const activities: Activity[] = [
      {
        type: 'task',
        id: 'task-1',
        name: 'Normal Task',
        task: {
          executor: 'script',
          config: {
            language: 'python',
            code: 'print("hello")',
          },
        },
      },
      {
        type: 'condition',
        id: 'condition-1',
        name: 'Check Status',
        condition: '${output.status == "success"}',
        then: [],
        else: [],
      },
    ]

    const errors = validateNoGenericNodes(activities)
    expect(errors).toEqual([])
  })

  it('returns error for generic node with __isGeneric metadata', () => {
    const activities: Activity[] = [
      {
        type: 'task',
        id: 'generic-1',
        name: 'Placeholder',
        metadata: {
          __isGeneric: true,
        },
        task: {
          config: {},
        },
      },
    ]

    const errors = validateNoGenericNodes(activities)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({
      id: 'generic-node-generic-1',
      severity: 'error',
      rule: 'no-generic-nodes',
      message: 'Placeholder node "Placeholder" must be configured before saving',
      nodeId: 'generic-1',
      suggestion: 'Click on the placeholder node to select a node type and configure it',
    })
  })

  it('returns error for generic node without name', () => {
    const activities: Activity[] = [
      {
        type: 'task',
        id: 'generic-1',
        name: '',
        metadata: {
          __isGeneric: true,
        },
        task: {
          config: {},
        },
      },
    ]

    const errors = validateNoGenericNodes(activities)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe('Placeholder node "Untitled" must be configured before saving')
  })

  it('returns multiple errors for multiple generic nodes', () => {
    const activities: Activity[] = [
      {
        type: 'task',
        id: 'generic-1',
        name: 'First Placeholder',
        metadata: {
          __isGeneric: true,
        },
        task: {
          config: {},
        },
      },
      {
        type: 'task',
        id: 'normal-1',
        name: 'Normal Task',
        task: {
          executor: 'script',
          config: {
            language: 'python',
            code: 'print("hello")',
          },
        },
      },
      {
        type: 'task',
        id: 'generic-2',
        name: 'Second Placeholder',
        metadata: {
          __isGeneric: true,
        },
        task: {
          config: {},
        },
      },
    ]

    const errors = validateNoGenericNodes(activities)
    expect(errors).toHaveLength(2)
    expect(errors[0].nodeId).toBe('generic-1')
    expect(errors[1].nodeId).toBe('generic-2')
  })

  it('ignores nodes without __isGeneric metadata', () => {
    const activities: Activity[] = [
      {
        type: 'task',
        id: 'task-1',
        name: 'Task with other metadata',
        metadata: {
          someOtherFlag: true,
        },
        task: {
          executor: 'script',
          config: {
            language: 'python',
            code: 'print("hello")',
          },
        },
      },
    ]

    const errors = validateNoGenericNodes(activities)
    expect(errors).toEqual([])
  })

  it('ignores nodes with __isGeneric set to false', () => {
    const activities: Activity[] = [
      {
        type: 'task',
        id: 'task-1',
        name: 'Not Generic',
        metadata: {
          __isGeneric: false,
        },
        task: {
          executor: 'script',
          config: {
            language: 'python',
            code: 'print("hello")',
          },
        },
      },
    ]

    const errors = validateNoGenericNodes(activities)
    expect(errors).toEqual([])
  })

  it('detects generic node inside loop do array', () => {
    const activities: Activity[] = [
      {
        type: 'loop',
        id: 'loop-1',
        name: 'My Loop',
        loop: {
          type: 'forEach',
          items: '${input.items}',
          do: [
            {
              type: 'task',
              id: 'generic-1',
              name: 'Placeholder',
              metadata: {
                __isGeneric: true,
              },
              task: {
                config: {},
              },
            },
          ],
        },
      },
    ]

    const errors = validateNoGenericNodes(activities)
    expect(errors).toHaveLength(1)
    expect(errors[0].nodeId).toBe('generic-1')
    expect(errors[0].message).toBe('Placeholder node "Placeholder" must be configured before saving')
  })

  it('detects generic node inside condition then branch', () => {
    const activities: Activity[] = [
      {
        type: 'condition',
        id: 'condition-1',
        name: 'Check Status',
        condition: '${status == "ok"}',
        then: [
          {
            type: 'task',
            id: 'generic-1',
            name: 'Placeholder',
            metadata: {
              __isGeneric: true,
            },
            task: {
              config: {},
            },
          },
        ],
        else: [],
      },
    ]

    const errors = validateNoGenericNodes(activities)
    expect(errors).toHaveLength(1)
    expect(errors[0].nodeId).toBe('generic-1')
  })

  it('detects generic node inside condition else branch', () => {
    const activities: Activity[] = [
      {
        type: 'condition',
        id: 'condition-1',
        name: 'Check Status',
        condition: '${status == "ok"}',
        then: [],
        else: [
          {
            type: 'task',
            id: 'generic-1',
            name: 'Placeholder',
            metadata: {
              __isGeneric: true,
            },
            task: {
              config: {},
            },
          },
        ],
      },
    ]

    const errors = validateNoGenericNodes(activities)
    expect(errors).toHaveLength(1)
    expect(errors[0].nodeId).toBe('generic-1')
  })

  it('detects generic node inside parallel branches', () => {
    const activities: Activity[] = [
      {
        type: 'parallel',
        id: 'parallel-1',
        name: 'Parallel Tasks',
        branches: [
          {
            type: 'task',
            id: 'task-1',
            name: 'Normal Task',
            task: {
              executor: 'script',
              config: {
                language: 'python',
                code: 'print("hello")',
              },
            },
          },
          {
            type: 'task',
            id: 'generic-1',
            name: 'Placeholder',
            metadata: {
              __isGeneric: true,
            },
            task: {
              config: {},
            },
          },
        ],
      },
    ]

    const errors = validateNoGenericNodes(activities)
    expect(errors).toHaveLength(1)
    expect(errors[0].nodeId).toBe('generic-1')
  })

  it('detects multiple generic nodes in deeply nested structures', () => {
    const activities: Activity[] = [
      {
        type: 'loop',
        id: 'loop-1',
        name: 'Outer Loop',
        loop: {
          type: 'forEach',
          items: '${input.items}',
          do: [
            {
              type: 'condition',
              id: 'condition-1',
              name: 'Check Item',
              condition: '${item.valid}',
              then: [
                {
                  type: 'task',
                  id: 'generic-1',
                  name: 'Placeholder 1',
                  metadata: {
                    __isGeneric: true,
                  },
                  task: {
                    config: {},
                  },
                },
              ],
              else: [
                {
                  type: 'task',
                  id: 'generic-2',
                  name: 'Placeholder 2',
                  metadata: {
                    __isGeneric: true,
                  },
                  task: {
                    config: {},
                  },
                },
              ],
            },
          ],
        },
      },
    ]

    const errors = validateNoGenericNodes(activities)
    expect(errors).toHaveLength(2)
    expect(errors[0].nodeId).toBe('generic-1')
    expect(errors[1].nodeId).toBe('generic-2')
  })
})
