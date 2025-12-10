import type { Activity } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'

import { validateLoopNodes } from './validateLoopNodes'

describe('validateLoopNodes', () => {
  it('returns no errors for workflow without loop nodes', () => {
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

    const errors = validateLoopNodes(activities)
    expect(errors).toEqual([])
  })

  it('returns no errors for forEach loop with activities', () => {
    const activities: Activity[] = [
      {
        type: 'loop',
        id: 'loop-1',
        name: 'Process Items',
        loop: {
          type: 'forEach',
          items: '${input.items}',
          do: [
            {
              type: 'task',
              id: 'task-1',
              name: 'Process Item',
              task: {
                executor: 'script',
                config: {
                  language: 'python',
                  code: 'print(item)',
                },
              },
            },
          ],
        },
      },
    ]

    const errors = validateLoopNodes(activities)
    expect(errors).toEqual([])
  })

  it('returns no errors for while loop with activities', () => {
    const activities: Activity[] = [
      {
        type: 'loop',
        id: 'loop-1',
        name: 'While Loop',
        loop: {
          type: 'while',
          condition: '${counter < 10}',
          maxIterations: 100,
          do: [
            {
              type: 'task',
              id: 'task-1',
              name: 'Increment Counter',
              task: {
                executor: 'script',
                config: {
                  language: 'python',
                  code: 'counter += 1',
                },
              },
            },
          ],
        },
      },
    ]

    const errors = validateLoopNodes(activities)
    expect(errors).toEqual([])
  })

  it('returns error for forEach loop with empty do array', () => {
    const activities: Activity[] = [
      {
        type: 'loop',
        id: 'loop-1',
        name: 'Empty Loop',
        loop: {
          type: 'forEach',
          items: '${input.items}',
          do: [],
        },
      },
    ]

    const errors = validateLoopNodes(activities)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({
      id: 'empty-loop-loop-1',
      severity: 'error',
      rule: 'loop-must-have-activities',
      message: 'Loop "Empty Loop" must have at least one activity in its body',
      nodeId: 'loop-1',
      suggestion: 'Add activities to the loop body by connecting nodes to the loop handle',
    })
  })

  it('returns error for while loop with empty do array', () => {
    const activities: Activity[] = [
      {
        type: 'loop',
        id: 'loop-1',
        name: 'Empty While',
        loop: {
          type: 'while',
          condition: '${counter < 10}',
          do: [],
        },
      },
    ]

    const errors = validateLoopNodes(activities)
    expect(errors).toHaveLength(1)
    expect(errors[0].nodeId).toBe('loop-1')
  })

  it('returns error for loop without name', () => {
    const activities: Activity[] = [
      {
        type: 'loop',
        id: 'loop-1',
        name: '',
        loop: {
          type: 'forEach',
          items: '${input.items}',
          do: [],
        },
      },
    ]

    const errors = validateLoopNodes(activities)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe('Loop "Untitled" must have at least one activity in its body')
  })

  it('returns error for loop with missing do property', () => {
    const activities: Activity[] = [
      {
        type: 'loop',
        id: 'loop-1',
        name: 'Incomplete Loop',
        loop: {
          type: 'forEach',
          items: '${input.items}',
          // do property is missing
        },
      },
    ]

    const errors = validateLoopNodes(activities)
    expect(errors).toHaveLength(1)
    expect(errors[0].nodeId).toBe('loop-1')
  })

  it('returns multiple errors for multiple empty loops', () => {
    const activities: Activity[] = [
      {
        type: 'loop',
        id: 'loop-1',
        name: 'First Empty Loop',
        loop: {
          type: 'forEach',
          items: '${input.items}',
          do: [],
        },
      },
      {
        type: 'loop',
        id: 'loop-2',
        name: 'Valid Loop',
        loop: {
          type: 'forEach',
          items: '${input.items}',
          do: [
            {
              type: 'task',
              id: 'task-1',
              name: 'Task',
              task: {
                executor: 'script',
                config: {
                  language: 'python',
                  code: 'print("hello")',
                },
              },
            },
          ],
        },
      },
      {
        type: 'loop',
        id: 'loop-3',
        name: 'Second Empty Loop',
        loop: {
          type: 'while',
          condition: '${counter < 10}',
          do: [],
        },
      },
    ]

    const errors = validateLoopNodes(activities)
    expect(errors).toHaveLength(2)
    expect(errors[0].nodeId).toBe('loop-1')
    expect(errors[1].nodeId).toBe('loop-3')
  })

  it('handles loop with multiple activities in do array', () => {
    const activities: Activity[] = [
      {
        type: 'loop',
        id: 'loop-1',
        name: 'Multi-Activity Loop',
        loop: {
          type: 'forEach',
          items: '${input.items}',
          do: [
            {
              type: 'task',
              id: 'task-1',
              name: 'First Task',
              task: {
                executor: 'script',
                config: {
                  language: 'python',
                  code: 'print("first")',
                },
              },
            },
            {
              type: 'task',
              id: 'task-2',
              name: 'Second Task',
              task: {
                executor: 'script',
                config: {
                  language: 'python',
                  code: 'print("second")',
                },
              },
            },
          ],
        },
      },
    ]

    const errors = validateLoopNodes(activities)
    expect(errors).toEqual([])
  })

  it('detects empty loop nested inside another loop', () => {
    const activities: Activity[] = [
      {
        type: 'loop',
        id: 'outer-loop',
        name: 'Outer Loop',
        loop: {
          type: 'forEach',
          items: '${input.items}',
          do: [
            {
              type: 'loop',
              id: 'inner-loop',
              name: 'Inner Loop',
              loop: {
                type: 'forEach',
                items: '${input.innerItems}',
                do: [],
              },
            },
          ],
        },
      },
    ]

    const errors = validateLoopNodes(activities)
    expect(errors).toHaveLength(1)
    expect(errors[0].nodeId).toBe('inner-loop')
    expect(errors[0].message).toBe('Loop "Inner Loop" must have at least one activity in its body')
  })

  it('detects empty loop inside condition branch', () => {
    const activities: Activity[] = [
      {
        type: 'condition',
        id: 'condition-1',
        name: 'Check Status',
        condition: '${status == "ok"}',
        then: [
          {
            type: 'loop',
            id: 'loop-1',
            name: 'Then Loop',
            loop: {
              type: 'forEach',
              items: '${input.items}',
              do: [],
            },
          },
        ],
        else: [],
      },
    ]

    const errors = validateLoopNodes(activities)
    expect(errors).toHaveLength(1)
    expect(errors[0].nodeId).toBe('loop-1')
  })

  it('detects empty loop inside parallel branch', () => {
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
            type: 'loop',
            id: 'loop-1',
            name: 'Parallel Loop',
            loop: {
              type: 'forEach',
              items: '${input.items}',
              do: [],
            },
          },
        ],
      },
    ]

    const errors = validateLoopNodes(activities)
    expect(errors).toHaveLength(1)
    expect(errors[0].nodeId).toBe('loop-1')
  })

  it('detects multiple empty loops in deeply nested structures', () => {
    const activities: Activity[] = [
      {
        type: 'loop',
        id: 'outer-loop',
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
                  type: 'loop',
                  id: 'inner-loop-1',
                  name: 'Inner Loop 1',
                  loop: {
                    type: 'forEach',
                    items: '${item.data}',
                    do: [],
                  },
                },
              ],
              else: [
                {
                  type: 'loop',
                  id: 'inner-loop-2',
                  name: 'Inner Loop 2',
                  loop: {
                    type: 'forEach',
                    items: '${item.fallback}',
                    do: [],
                  },
                },
              ],
            },
          ],
        },
      },
    ]

    const errors = validateLoopNodes(activities)
    expect(errors).toHaveLength(2)
    expect(errors[0].nodeId).toBe('inner-loop-1')
    expect(errors[1].nodeId).toBe('inner-loop-2')
  })

  it('validates non-empty nested loops correctly', () => {
    const activities: Activity[] = [
      {
        type: 'loop',
        id: 'outer-loop',
        name: 'Outer Loop',
        loop: {
          type: 'forEach',
          items: '${input.items}',
          do: [
            {
              type: 'loop',
              id: 'inner-loop',
              name: 'Inner Loop',
              loop: {
                type: 'forEach',
                items: '${input.innerItems}',
                do: [
                  {
                    type: 'task',
                    id: 'task-1',
                    name: 'Inner Task',
                    task: {
                      executor: 'script',
                      config: {
                        language: 'python',
                        code: 'print("nested")',
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    ]

    const errors = validateLoopNodes(activities)
    expect(errors).toEqual([])
  })
})
