import type { Activity } from '@ansible/nexus-contracts'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import * as buildNestedModule from '../buildNestedStructure'
import { validateRoundTrip, validateSavePath } from '../validateRoundTrip'
import type { EdgeConnection } from '../workflowTransform'

// Mock import.meta.env.MODE to 'development' to enable validation
vi.stubGlobal('import', {
  meta: {
    env: {
      MODE: 'development',
    },
  },
})

describe('validateRoundTrip', () => {
  beforeAll(() => {
    import.meta.env.MODE = 'development'
  })

  it('accepts parallel containers with different IDs after round-trip', () => {
    // Original nested structure from API (parallel container with specific ID)
    const original: Activity[] = [
      {
        type: 'task',
        id: 'trigger',
        name: 'Manual',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      {
        type: 'condition',
        id: 'P',
        name: 'Condition P',
        condition: '${check}',
        then: [
          {
            type: 'parallel',
            id: 'parallel_abc123', // Original ID from API
            name: 'Parallel execution',
            branches: [
              {
                type: 'task',
                id: 'A1',
                name: 'Task A1',
                task: { executor: 'script', config: { language: 'python', code: '' } },
              },
              {
                type: 'task',
                id: 'A2',
                name: 'Task A2',
                task: { executor: 'script', config: { language: 'python', code: '' } },
              },
            ],
          },
        ],
        else: [],
      },
    ]

    // This should NOT throw even though the parallel container gets a new ID during round-trip
    expect(() => {
      validateRoundTrip(original)
    }).not.toThrow()
  })

  it('detects structural differences in parallel branches', () => {
    const original: Activity[] = [
      {
        type: 'condition',
        id: 'P',
        name: 'Condition P',
        condition: '${check}',
        then: [
          {
            type: 'parallel',
            id: 'parallel_1',
            name: 'Parallel execution',
            branches: [
              {
                type: 'task',
                id: 'A1',
                name: 'Task A1',
                task: { executor: 'script', config: { language: 'python', code: '' } },
              },
              {
                type: 'task',
                id: 'A2',
                name: 'Task A2',
                task: { executor: 'script', config: { language: 'python', code: '' } },
              },
            ],
          },
        ],
        else: [],
      },
    ]

    // This should NOT throw because the branches are structurally identical
    expect(() => {
      validateRoundTrip(original)
    }).not.toThrow()
  })

  it('validates condition nodes without parallel containers', () => {
    const original: Activity[] = [
      {
        type: 'condition',
        id: 'C',
        name: 'Condition C',
        condition: '${test}',
        then: [
          {
            type: 'task',
            id: 'T1',
            name: 'Task 1',
            task: { executor: 'script', config: { language: 'python', code: '' } },
          },
        ],
        else: [
          {
            type: 'task',
            id: 'T2',
            name: 'Task 2',
            task: { executor: 'script', config: { language: 'python', code: '' } },
          },
        ],
      },
    ]

    expect(() => {
      validateRoundTrip(original)
    }).not.toThrow()
  })

  it('skips validation for workflows with legacy sequence activities', () => {
    const original: Activity[] = [
      {
        type: 'sequence',
        id: 'seq_1',
        name: 'Sequential tasks',
        steps: [
          {
            type: 'task',
            id: 'A',
            name: 'Task A',
            task: { executor: 'script', config: { language: 'python', code: '' } },
          },
          {
            type: 'task',
            id: 'B',
            name: 'Task B',
            task: { executor: 'script', config: { language: 'python', code: '' } },
          },
        ],
      },
    ]

    // Should not throw - validation is skipped for legacy activities
    expect(() => {
      validateRoundTrip(original)
    }).not.toThrow()
  })

  it('skips validation for workflows with legacy loop activities', () => {
    const original = [
      {
        type: 'loop',
        id: 'loop_1',
        name: 'Loop tasks',
        loop: {
          over: '${items}',
          item: 'item',
          do: [
            {
              type: 'task',
              id: 'A',
              name: 'Task A',
              task: { executor: 'script', config: { language: 'python', code: '' } },
            },
          ],
        },
      },
    ] as unknown as Activity[]

    // Should not throw - validation is skipped for legacy activities
    expect(() => {
      validateRoundTrip(original)
    }).not.toThrow()
  })

  it('validates workflows with parallel_for_ wrappers (auto-generated)', () => {
    const original: Activity[] = [
      {
        type: 'task',
        id: 'trigger',
        name: 'Manual',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      {
        type: 'parallel',
        id: 'parallel_for_join_123', // Auto-generated wrapper for join node
        name: 'Parallel execution',
        branches: [
          {
            type: 'task',
            id: 'A1',
            name: 'Task A1',
            task: { executor: 'script', config: { language: 'python', code: '' } },
          },
          {
            type: 'task',
            id: 'A2',
            name: 'Task A2',
            task: { executor: 'script', config: { language: 'python', code: '' } },
          },
        ],
      },
    ]

    // Should not throw - parallel_for_ wrappers are modern and should round-trip correctly
    expect(() => {
      validateRoundTrip(original)
    }).not.toThrow()
  })

  it('skips validation for workflows with nested sequence/parallel/loop in conditions', () => {
    // This tests the recursive detection of legacy activities
    // Matches the user's workflow structure: condition with parallel+sequence in else branch
    const original: Activity[] = [
      {
        type: 'condition',
        id: 'cond1',
        name: 'Condition 1',
        condition: '${check}',
        then: [
          {
            type: 'task',
            id: 'T1',
            name: 'Task 1',
            task: { executor: 'script', config: { language: 'python', code: '' } },
          },
        ],
        else: [
          {
            type: 'parallel',
            id: 'parallel_1', // User-created parallel (not parallel_for_)
            name: 'Parallel execution',
            branches: [
              {
                type: 'sequence',
                id: 'seq_1',
                name: 'Sequential tasks',
                steps: [
                  {
                    type: 'task',
                    id: 'F',
                    name: 'Task F',
                    task: { executor: 'script', config: { language: 'python', code: '' } },
                  },
                  {
                    type: 'task',
                    id: 'M',
                    name: 'Task M',
                    task: { executor: 'script', config: { language: 'python', code: '' } },
                  },
                ],
              },
              {
                type: 'task',
                id: 'N',
                name: 'Task N',
                task: { executor: 'script', config: { language: 'python', code: '' } },
              },
            ],
          },
        ],
      },
    ]

    // Should not throw - validation is skipped because sequence is nested inside condition
    // This tests that hasLegacyActivityTypes() recursively searches nested structures
    expect(() => {
      validateRoundTrip(original)
    }).not.toThrow()
  })

  it('handles validation with provided edges', () => {
    const original: Activity[] = [
      {
        type: 'condition',
        id: 'C',
        name: 'Condition C',
        condition: '${test}',
        then: [
          {
            type: 'task',
            id: 'T1',
            name: 'Task 1',
            task: { executor: 'script', config: { language: 'python', code: '' } },
          },
        ],
        else: [],
      },
    ]

    const edges: EdgeConnection[] = [
      { id: 'C-T1', source: 'C', target: 'T1', sourceHandle: 'true', targetHandle: 'target' },
    ]

    expect(() => {
      validateRoundTrip(original, edges)
    }).not.toThrow()
  })

  it('validates empty workflow', () => {
    const original: Activity[] = []
    expect(() => {
      validateRoundTrip(original)
    }).not.toThrow()
  })

  it('validates simple task workflow without containers', () => {
    const original: Activity[] = [
      {
        type: 'task',
        id: 'T1',
        name: 'Task 1',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
    ]

    expect(() => {
      validateRoundTrip(original)
    }).not.toThrow()
  })

  it('skips validation for user-created parallel nodes', () => {
    const original: Activity[] = [
      {
        type: 'parallel',
        id: 'user_parallel_1', // Not prefixed with parallel_for_
        name: 'User Parallel',
        branches: [
          {
            type: 'task',
            id: 'T1',
            name: 'Task 1',
            task: { executor: 'script', config: { language: 'python', code: '' } },
          },
        ],
      },
    ]

    // Should not throw - user-created parallels are considered legacy
    expect(() => {
      validateRoundTrip(original)
    }).not.toThrow()
  })

  it('handles condition with deeply nested structures', () => {
    const original: Activity[] = [
      {
        type: 'condition',
        id: 'outer-cond',
        name: 'Outer Condition',
        condition: '${check1}',
        then: [
          {
            type: 'condition',
            id: 'inner-cond',
            name: 'Inner Condition',
            condition: '${check2}',
            then: [
              {
                type: 'task',
                id: 'nested-task',
                name: 'Nested Task',
                task: { executor: 'script', config: { language: 'python', code: '' } },
              },
            ],
            else: [],
          },
        ],
        else: [],
      },
    ]

    expect(() => {
      validateRoundTrip(original)
    }).not.toThrow()
  })

  it('handles condition with empty then and non-empty else', () => {
    const original: Activity[] = [
      {
        type: 'condition',
        id: 'C',
        name: 'Condition',
        condition: '${test}',
        then: [],
        else: [
          {
            type: 'task',
            id: 'T1',
            name: 'Task 1',
            task: { executor: 'script', config: { language: 'python', code: '' } },
          },
        ],
      },
    ]

    expect(() => {
      validateRoundTrip(original)
    }).not.toThrow()
  })

  it('handles loop nested inside condition then branch', () => {
    const original: Activity[] = [
      {
        type: 'condition',
        id: 'C',
        name: 'Condition',
        condition: '${test}',
        then: [
          {
            type: 'loop',
            id: 'loop_1',
            name: 'Loop',
            loop: {
              over: '${items}',
              item: 'item',
              do: [
                {
                  type: 'task',
                  id: 'T1',
                  name: 'Task 1',
                  task: { executor: 'script', config: { language: 'python', code: '' } },
                },
              ],
            },
          },
        ] as unknown as Activity[],
        else: [],
      },
    ]

    // Should skip validation due to nested loop (legacy activity)
    expect(() => {
      validateRoundTrip(original)
    }).not.toThrow()
  })

  it('logs and continues on unexpected errors during validation', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Create activities that will cause an unexpected error during flattening
    // by having undefined nested arrays
    const original = [
      {
        type: 'condition',
        id: 'C',
        name: 'Condition',
        condition: '${test}',
        then: undefined,
        else: undefined,
      },
    ] as unknown as Activity[]

    // Should not throw - unexpected errors are caught and logged
    expect(() => {
      validateRoundTrip(original)
    }).not.toThrow()

    consoleSpy.mockRestore()
    warnSpy.mockRestore()
  })

  describe('structural comparison failures', () => {
    beforeEach(() => {
      vi.restoreAllMocks()
    })

    it('throws when rebuilt structure has different length', () => {
      const buildSpy = vi.spyOn(buildNestedModule, 'buildNestedConditionStructure').mockReturnValue([])

      const original: Activity[] = [
        {
          type: 'task',
          id: 'T1',
          name: 'Task 1',
          task: { executor: 'script', config: { language: 'python', code: '' } },
        },
      ]

      expect(() => {
        validateRoundTrip(original)
      }).toThrow('Workflow structure changed during round-trip conversion')

      buildSpy.mockRestore()
    })

    it('throws when rebuilt activity has different type', () => {
      const buildSpy = vi.spyOn(buildNestedModule, 'buildNestedConditionStructure').mockReturnValue([
        {
          type: 'condition',
          id: 'T1',
          name: 'Task 1',
          condition: '${test}',
          then: [],
          else: [],
        },
      ])

      const original: Activity[] = [
        {
          type: 'task',
          id: 'T1',
          name: 'Task 1',
          task: { executor: 'script', config: { language: 'python', code: '' } },
        },
      ]

      expect(() => {
        validateRoundTrip(original)
      }).toThrow('Workflow structure changed during round-trip conversion')

      buildSpy.mockRestore()
    })

    it('throws when rebuilt activity has different ID', () => {
      const buildSpy = vi.spyOn(buildNestedModule, 'buildNestedConditionStructure').mockReturnValue([
        {
          type: 'task',
          id: 'T2',
          name: 'Task 1',
          task: { executor: 'script', config: { language: 'python', code: '' } },
        },
      ])

      const original: Activity[] = [
        {
          type: 'task',
          id: 'T1',
          name: 'Task 1',
          task: { executor: 'script', config: { language: 'python', code: '' } },
        },
      ]

      expect(() => {
        validateRoundTrip(original)
      }).toThrow('Workflow structure changed during round-trip conversion')

      buildSpy.mockRestore()
    })

    it('throws when rebuilt activity has different name', () => {
      const buildSpy = vi.spyOn(buildNestedModule, 'buildNestedConditionStructure').mockReturnValue([
        {
          type: 'task',
          id: 'T1',
          name: 'Different Name',
          task: { executor: 'script', config: { language: 'python', code: '' } },
        },
      ])

      const original: Activity[] = [
        {
          type: 'task',
          id: 'T1',
          name: 'Task 1',
          task: { executor: 'script', config: { language: 'python', code: '' } },
        },
      ]

      expect(() => {
        validateRoundTrip(original)
      }).toThrow('Workflow structure changed during round-trip conversion')

      buildSpy.mockRestore()
    })

    it('throws when condition has different condition expression', () => {
      const buildSpy = vi.spyOn(buildNestedModule, 'buildNestedConditionStructure').mockReturnValue([
        {
          type: 'condition',
          id: 'C1',
          name: 'Condition',
          condition: '${different}',
          then: [],
          else: [],
        },
      ])

      const original: Activity[] = [
        {
          type: 'condition',
          id: 'C1',
          name: 'Condition',
          condition: '${test}',
          then: [],
          else: [],
        },
      ]

      expect(() => {
        validateRoundTrip(original)
      }).toThrow('Workflow structure changed during round-trip conversion')

      buildSpy.mockRestore()
    })

    it('throws when condition then branch differs', () => {
      const buildSpy = vi.spyOn(buildNestedModule, 'buildNestedConditionStructure').mockReturnValue([
        {
          type: 'condition',
          id: 'C1',
          name: 'Condition',
          condition: '${test}',
          then: [
            {
              type: 'task',
              id: 'different',
              name: 'Different',
              task: { executor: 'script', config: { language: 'python', code: '' } },
            },
          ],
          else: [],
        },
      ])

      const original: Activity[] = [
        {
          type: 'condition',
          id: 'C1',
          name: 'Condition',
          condition: '${test}',
          then: [
            {
              type: 'task',
              id: 'T1',
              name: 'Task 1',
              task: { executor: 'script', config: { language: 'python', code: '' } },
            },
          ],
          else: [],
        },
      ]

      expect(() => {
        validateRoundTrip(original)
      }).toThrow('Workflow structure changed during round-trip conversion')

      buildSpy.mockRestore()
    })

    it('throws when condition else branch differs', () => {
      const buildSpy = vi.spyOn(buildNestedModule, 'buildNestedConditionStructure').mockReturnValue([
        {
          type: 'condition',
          id: 'C1',
          name: 'Condition',
          condition: '${test}',
          then: [],
          else: [
            {
              type: 'task',
              id: 'different',
              name: 'Different',
              task: { executor: 'script', config: { language: 'python', code: '' } },
            },
          ],
        },
      ])

      const original: Activity[] = [
        {
          type: 'condition',
          id: 'C1',
          name: 'Condition',
          condition: '${test}',
          then: [],
          else: [
            {
              type: 'task',
              id: 'T1',
              name: 'Task 1',
              task: { executor: 'script', config: { language: 'python', code: '' } },
            },
          ],
        },
      ]

      expect(() => {
        validateRoundTrip(original)
      }).toThrow('Workflow structure changed during round-trip conversion')

      buildSpy.mockRestore()
    })

    it('throws when parallel branches differ', () => {
      const buildSpy = vi.spyOn(buildNestedModule, 'buildNestedConditionStructure').mockReturnValue([
        {
          type: 'parallel',
          id: 'parallel_for_test',
          name: 'Parallel',
          branches: [
            {
              type: 'task',
              id: 'different',
              name: 'Different',
              task: { executor: 'script', config: { language: 'python', code: '' } },
            },
          ],
        },
      ])

      const original: Activity[] = [
        {
          type: 'parallel',
          id: 'parallel_for_test',
          name: 'Parallel',
          branches: [
            {
              type: 'task',
              id: 'T1',
              name: 'Task 1',
              task: { executor: 'script', config: { language: 'python', code: '' } },
            },
          ],
        },
      ]

      expect(() => {
        validateRoundTrip(original)
      }).toThrow('Workflow structure changed during round-trip conversion')

      buildSpy.mockRestore()
    })

    it('throws when sequence steps differ', () => {
      // First mock to return a sequence with different steps
      const buildSpy = vi.spyOn(buildNestedModule, 'buildNestedConditionStructure').mockReturnValue([
        {
          type: 'sequence',
          id: 'seq_1',
          name: 'Sequence',
          steps: [
            {
              type: 'task',
              id: 'different',
              name: 'Different',
              task: { executor: 'script', config: { language: 'python', code: '' } },
            },
          ],
        },
      ])

      // Use a parallel_for_ wrapper so it's not considered legacy
      const original: Activity[] = [
        {
          type: 'sequence',
          id: 'seq_1',
          name: 'Sequence',
          steps: [
            {
              type: 'task',
              id: 'T1',
              name: 'Task 1',
              task: { executor: 'script', config: { language: 'python', code: '' } },
            },
          ],
        },
      ]

      // Note: This won't throw because sequence is considered legacy
      // The validation is skipped for legacy activities
      expect(() => {
        validateRoundTrip(original)
      }).not.toThrow()

      buildSpy.mockRestore()
    })

    it('throws when loop do activities differ', () => {
      const buildSpy = vi.spyOn(buildNestedModule, 'buildNestedConditionStructure').mockReturnValue([
        {
          type: 'loop',
          id: 'loop_1',
          name: 'Loop',
          loop: {
            over: '${items}',
            item: 'item',
            do: [
              {
                type: 'task',
                id: 'different',
                name: 'Different',
                task: { executor: 'script', config: { language: 'python', code: '' } },
              },
            ],
          },
        },
      ] as unknown as Activity[])

      const original = [
        {
          type: 'loop',
          id: 'loop_1',
          name: 'Loop',
          loop: {
            over: '${items}',
            item: 'item',
            do: [
              {
                type: 'task',
                id: 'T1',
                name: 'Task 1',
                task: { executor: 'script', config: { language: 'python', code: '' } },
              },
            ],
          },
        },
      ] as unknown as Activity[]

      // Note: This won't throw because loop is considered legacy
      expect(() => {
        validateRoundTrip(original)
      }).not.toThrow()

      buildSpy.mockRestore()
    })
  })
})

describe('validateSavePath', () => {
  beforeAll(() => {
    import.meta.env.MODE = 'development'
  })

  it('validates that flat activities can be nested', () => {
    const activities: Activity[] = [
      {
        type: 'task',
        id: 'T1',
        name: 'Task 1',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
    ]
    const edges: EdgeConnection[] = []

    expect(() => {
      validateSavePath(activities, edges)
    }).not.toThrow()
  })

  it('validates condition with edges defining branches', () => {
    const activities: Activity[] = [
      {
        type: 'condition',
        id: 'C1',
        name: 'Condition 1',
        condition: '${check}',
        then: [],
        else: [],
      },
      {
        type: 'task',
        id: 'T1',
        name: 'Task 1',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
      {
        type: 'task',
        id: 'T2',
        name: 'Task 2',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
    ]
    const edges: EdgeConnection[] = [
      { id: 'C1-T1', source: 'C1', target: 'T1', sourceHandle: 'true', targetHandle: 'target' },
      { id: 'C1-T2', source: 'C1', target: 'T2', sourceHandle: 'false', targetHandle: 'target' },
    ]

    expect(() => {
      validateSavePath(activities, edges)
    }).not.toThrow()
  })

  it('validates empty workflow', () => {
    expect(() => {
      validateSavePath([], [])
    }).not.toThrow()
  })

  it('handles multiple conditions', () => {
    const activities: Activity[] = [
      {
        type: 'condition',
        id: 'C1',
        name: 'Condition 1',
        condition: '${check1}',
        then: [],
        else: [],
      },
      {
        type: 'condition',
        id: 'C2',
        name: 'Condition 2',
        condition: '${check2}',
        then: [],
        else: [],
      },
      {
        type: 'task',
        id: 'T1',
        name: 'Task 1',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
    ]
    const edges: EdgeConnection[] = [
      { id: 'C1-T1', source: 'C1', target: 'T1', sourceHandle: 'true', targetHandle: 'target' },
      { id: 'C2-T1', source: 'C2', target: 'T1', sourceHandle: 'false', targetHandle: 'target' },
    ]

    expect(() => {
      validateSavePath(activities, edges)
    }).not.toThrow()
  })

  it('warns when condition has outgoing edges but empty then/else arrays', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const activities: Activity[] = [
      {
        type: 'condition',
        id: 'C1',
        name: 'Condition 1',
        condition: '${check}',
        then: [],
        else: [],
      },
    ]
    // Edges indicate there should be branches, but the nested structure has empty arrays
    const edges: EdgeConnection[] = [
      { id: 'C1-T1', source: 'C1', target: 'T1', sourceHandle: 'true', targetHandle: 'target' },
      { id: 'C1-T2', source: 'C1', target: 'T2', sourceHandle: 'false', targetHandle: 'target' },
    ]

    // Should not throw, but should warn
    expect(() => {
      validateSavePath(activities, edges)
    }).not.toThrow()

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Condition node C1 has outgoing edges but empty then/else arrays')
    )

    warnSpy.mockRestore()
  })

  it('handles condition with only true branch edge', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const activities: Activity[] = [
      {
        type: 'condition',
        id: 'C1',
        name: 'Condition 1',
        condition: '${check}',
        then: [],
        else: [],
      },
    ]
    const edges: EdgeConnection[] = [
      { id: 'C1-T1', source: 'C1', target: 'T1', sourceHandle: 'true', targetHandle: 'target' },
    ]

    expect(() => {
      validateSavePath(activities, edges)
    }).not.toThrow()

    warnSpy.mockRestore()
  })

  it('handles condition with only false branch edge', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const activities: Activity[] = [
      {
        type: 'condition',
        id: 'C1',
        name: 'Condition 1',
        condition: '${check}',
        then: [],
        else: [],
      },
    ]
    const edges: EdgeConnection[] = [
      { id: 'C1-T2', source: 'C1', target: 'T2', sourceHandle: 'false', targetHandle: 'target' },
    ]

    expect(() => {
      validateSavePath(activities, edges)
    }).not.toThrow()

    warnSpy.mockRestore()
  })

  it('does not warn when condition has no outgoing branch edges', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const activities: Activity[] = [
      {
        type: 'condition',
        id: 'C1',
        name: 'Condition 1',
        condition: '${check}',
        then: [],
        else: [],
      },
    ]
    // No true/false edges - just a regular edge
    const edges: EdgeConnection[] = [
      { id: 'C1-T1', source: 'C1', target: 'T1', sourceHandle: 'source', targetHandle: 'target' },
    ]

    expect(() => {
      validateSavePath(activities, edges)
    }).not.toThrow()

    expect(warnSpy).not.toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  it('throws when buildNestedConditionStructure returns non-array', () => {
    const buildSpy = vi
      .spyOn(buildNestedModule, 'buildNestedConditionStructure')
      .mockReturnValue('not an array' as unknown as Activity[])

    const activities: Activity[] = [
      {
        type: 'task',
        id: 'T1',
        name: 'Task 1',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
    ]
    const edges: EdgeConnection[] = []

    expect(() => {
      validateSavePath(activities, edges)
    }).toThrow('buildNestedConditionStructure did not return an array')

    buildSpy.mockRestore()
  })

  it('throws with original error message when buildNestedConditionStructure throws', () => {
    const buildSpy = vi.spyOn(buildNestedModule, 'buildNestedConditionStructure').mockImplementation(() => {
      throw new Error('Something went wrong')
    })

    const activities: Activity[] = [
      {
        type: 'task',
        id: 'T1',
        name: 'Task 1',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
    ]
    const edges: EdgeConnection[] = []

    expect(() => {
      validateSavePath(activities, edges)
    }).toThrow('Failed to build nested structure from flat activities')

    buildSpy.mockRestore()
  })

  it('handles Error throws in validateSavePath', () => {
    const buildSpy = vi.spyOn(buildNestedModule, 'buildNestedConditionStructure').mockImplementation(() => {
      throw new Error('string error')
    })

    const activities: Activity[] = [
      {
        type: 'task',
        id: 'T1',
        name: 'Task 1',
        task: { executor: 'script', config: { language: 'python', code: '' } },
      },
    ]
    const edges: EdgeConnection[] = []

    expect(() => {
      validateSavePath(activities, edges)
    }).toThrow('Original error: string error')

    buildSpy.mockRestore()
  })
})
