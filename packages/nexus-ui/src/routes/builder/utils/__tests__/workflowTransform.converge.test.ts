import type { Activity } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'

import { WorkflowTransform } from '../workflowTransform'

describe('WorkflowTransform - Converge Edge Handling', () => {
  it('creates edges from converge node to following activity in normal order', () => {
    // Backend returns: [C(nested), J(converge), M]
    const activities: Activity[] = [
      {
        id: 'C',
        name: 'C',
        then: [
          {
            id: 'A',
            name: 'A',
            task: {
              config: { code: 'a', language: 'python', environment: {}, timeout_seconds: 300 },
              executor: 'script',
            },
            type: 'task',
            requiresApproval: false,
          },
          {
            id: 'B',
            name: 'B',
            task: {
              config: { code: 'b', language: 'python', environment: {}, timeout_seconds: 300 },
              executor: 'script',
            },
            type: 'task',
            requiresApproval: false,
          },
        ],
        type: 'condition',
        condition: { expression: 'c' },
        requiresApproval: false,
      },
      {
        id: 'J',
        name: 'J',
        type: 'converge',
        converge: {
          timeout: '',
          branches: ['A', 'B'],
          strategy: 'all',
          onTimeout: 'fail',
          aggregateOutputs: true,
        },
        requiresApproval: false,
      },
      {
        id: 'M',
        name: 'M',
        task: {
          config: { code: 'm', language: 'python', environment: {}, timeout_seconds: 300 },
          executor: 'script',
        },
        type: 'task',
        requiresApproval: false,
      },
    ]

    const { edges } = WorkflowTransform.flatten(activities)

    // Should create edge J→M
    const jToM = edges.find((e) => e.source === 'J' && e.target === 'M')
    expect(jToM).toBeDefined()
    expect(jToM?.sourceHandle).toBe('source')
    expect(jToM?.targetHandle).toBe('target')

    // Should NOT create edge M→J
    const mToJ = edges.find((e) => e.source === 'M' && e.target === 'J')
    expect(mToJ).toBeUndefined()
  })

  it('creates edges from converge node to activity when backend reorders (converge last)', () => {
    // Backend returns: [C(nested), M, J(converge)] - WRONG ORDER!
    // Should still create J→M edge
    const activities: Activity[] = [
      {
        id: 'C',
        name: 'C',
        then: [
          {
            id: 'A',
            name: 'A',
            task: {
              config: { code: 'a', language: 'python', environment: {}, timeout_seconds: 300 },
              executor: 'script',
            },
            type: 'task',
            requiresApproval: false,
          },
          {
            id: 'B',
            name: 'B',
            task: {
              config: { code: 'b', language: 'python', environment: {}, timeout_seconds: 300 },
              executor: 'script',
            },
            type: 'task',
            requiresApproval: false,
          },
        ],
        type: 'condition',
        condition: { expression: 'c' },
        requiresApproval: false,
      },
      {
        id: 'M',
        name: 'M',
        task: {
          config: { code: 'm', language: 'python', environment: {}, timeout_seconds: 300 },
          executor: 'script',
        },
        type: 'task',
        requiresApproval: false,
      },
      {
        id: 'J',
        name: 'J',
        type: 'converge',
        converge: {
          timeout: '',
          branches: ['A', 'B'],
          strategy: 'all',
          onTimeout: 'fail',
          aggregateOutputs: true,
        },
        requiresApproval: false,
      },
    ]

    const { edges } = WorkflowTransform.flatten(activities)

    // Should create edge J→M even though M appears before J in array
    const jToM = edges.find((e) => e.source === 'J' && e.target === 'M')
    expect(jToM).toBeDefined()
    expect(jToM?.sourceHandle).toBe('source')
    expect(jToM?.targetHandle).toBe('target')

    // Should NOT create edge M→J
    const mToJ = edges.find((e) => e.source === 'M' && e.target === 'J')
    expect(mToJ).toBeUndefined()
  })

  it('handles real workflow from Demo5 with converge at end of array', () => {
    // Real workflow structure from user's Demo5 (version 37)
    // Backend returns: [C(nested), M, N, J(converge)]
    const activities: Activity[] = [
      {
        id: 'logic_1766167268692_ckvmwn177rhuk',
        name: 'C',
        then: [
          {
            id: 'logic_1766169299030_yf7ck0ikej1l',
            loop: {
              do: [
                {
                  id: 'task_1766169299030_185qvpz14td815',
                  name: 'LD',
                  task: {
                    config: {
                      code: 'LD',
                      language: 'python',
                      environment: {},
                      timeout_seconds: 300,
                    },
                    executor: 'script',
                  },
                  type: 'task',
                  requiresApproval: false,
                },
              ],
              type: 'forEach',
              items: { expression: 'a' },
              itemVariable: 'item',
              indexVariable: 'index',
            },
            name: 'L0',
            type: 'loop',
            requiresApproval: false,
          },
          {
            id: 'logic_1766169426562_13xmnc09zptek',
            name: 'cond2',
            then: [
              {
                id: 'parallel_1766210276399_2',
                name: 'Parallel execution',
                type: 'parallel',
                branches: [
                  {
                    id: 'activity_ad085604_6f81_4862_9f77_bf7087faa16a',
                    name: 'A',
                    task: {
                      config: {
                        code: 'a',
                        language: 'python',
                        environment: {},
                        timeout_seconds: 300,
                      },
                      executor: 'script',
                    },
                    type: 'task',
                    requiresApproval: false,
                  },
                  {
                    id: 'activity_bbf6ae8d_969f_4deb_ad2e_35b021eb16f0',
                    name: 'B',
                    task: {
                      config: {
                        code: 'm',
                        language: 'python',
                        environment: {},
                        timeout_seconds: 300,
                      },
                      executor: 'script',
                    },
                    type: 'task',
                    requiresApproval: false,
                  },
                  {
                    id: 'activity_e9928fd0_9acf_48e9_b27c_7ec77d68b82c',
                    name: 'C',
                    task: {
                      config: {
                        code: 'C',
                        language: 'python',
                        environment: {},
                        timeout_seconds: 300,
                      },
                      executor: 'script',
                    },
                    type: 'task',
                    requiresApproval: false,
                  },
                ],
                requiresApproval: false,
              },
            ],
            type: 'condition',
            condition: { expression: 'a' },
            requiresApproval: false,
          },
        ],
        type: 'condition',
        condition: { expression: 'c' },
        requiresApproval: false,
      },
      {
        id: 'activity_db9e613e_4d98_40d2_9c6e_ca300898a95d',
        name: 'M',
        task: {
          config: {
            code: 'm',
            language: 'python',
            environment: {},
            timeout_seconds: 300,
          },
          executor: 'script',
        },
        type: 'task',
        requiresApproval: false,
      },
      {
        id: 'activity_0ba8b300_788b_4c95_97a5_9d696e2985e9',
        name: 'N',
        task: {
          config: {
            code: 'N',
            language: 'python',
            environment: {},
            timeout_seconds: 300,
          },
          executor: 'script',
        },
        type: 'task',
        requiresApproval: false,
      },
      {
        id: 'logic_1766167497241_1dc93jkuglep8',
        name: 'J',
        type: 'converge',
        converge: {
          timeout: '',
          branches: [
            'activity_ad085604_6f81_4862_9f77_bf7087faa16a',
            'activity_bbf6ae8d_969f_4deb_ad2e_35b021eb16f0',
            'activity_e9928fd0_9acf_48e9_b27c_7ec77d68b82c',
          ],
          strategy: 'all',
          onTimeout: 'fail',
          aggregateOutputs: true,
        },
        requiresApproval: false,
      },
    ]

    const { activities: flat, edges } = WorkflowTransform.flatten(activities)

    // Verify flattened structure
    const flatNames = flat.map((a) => a.name)
    expect(flatNames).toContain('C')
    expect(flatNames).toContain('L0')
    expect(flatNames).toContain('LD')
    expect(flatNames).toContain('cond2')
    expect(flatNames).toContain('A')
    expect(flatNames).toContain('B')
    expect(flatNames).toContain('M')
    expect(flatNames).toContain('N')
    expect(flatNames).toContain('J')

    // Edges from parallel branches to converge
    const aToJ = edges.find(
      (e) =>
        e.source === 'activity_ad085604_6f81_4862_9f77_bf7087faa16a' && e.target === 'logic_1766167497241_1dc93jkuglep8'
    )
    const bToJ = edges.find(
      (e) =>
        e.source === 'activity_bbf6ae8d_969f_4deb_ad2e_35b021eb16f0' && e.target === 'logic_1766167497241_1dc93jkuglep8'
    )
    const cToJ = edges.find(
      (e) =>
        e.source === 'activity_e9928fd0_9acf_48e9_b27c_7ec77d68b82c' && e.target === 'logic_1766167497241_1dc93jkuglep8'
    )

    expect(aToJ).toBeDefined()
    expect(bToJ).toBeDefined()
    expect(cToJ).toBeDefined()

    // CRITICAL: Edge from converge to M (even though J is last in array!)
    const jToM = edges.find(
      (e) =>
        e.source === 'logic_1766167497241_1dc93jkuglep8' && e.target === 'activity_db9e613e_4d98_40d2_9c6e_ca300898a95d'
    )
    expect(jToM).toBeDefined()
    expect(jToM?.sourceHandle).toBe('source')
    expect(jToM?.targetHandle).toBe('target')
  })

  it('handles round-trip with converge and sequential activities', () => {
    // Start with flat representation
    const flatActivities: Activity[] = [
      {
        id: 'C',
        name: 'C',
        then: [],
        type: 'condition',
        condition: { expression: 'c' },
        requiresApproval: false,
        else: [],
      },
      {
        id: 'A',
        name: 'A',
        task: {
          config: { code: 'a', language: 'python', environment: {}, timeout_seconds: 300 },
          executor: 'script',
        },
        type: 'task',
        requiresApproval: false,
      },
      {
        id: 'B',
        name: 'B',
        task: {
          config: { code: 'b', language: 'python', environment: {}, timeout_seconds: 300 },
          executor: 'script',
        },
        type: 'task',
        requiresApproval: false,
      },
      {
        id: 'J',
        name: 'J',
        type: 'converge',
        converge: {
          timeout: '',
          branches: ['A', 'B'],
          strategy: 'all',
          onTimeout: 'fail',
          aggregateOutputs: true,
        },
        requiresApproval: false,
      },
      {
        id: 'M',
        name: 'M',
        task: {
          config: { code: 'm', language: 'python', environment: {}, timeout_seconds: 300 },
          executor: 'script',
        },
        type: 'task',
        requiresApproval: false,
      },
    ]

    const flatEdges = [
      { id: 'C-A', source: 'C', target: 'A', sourceHandle: 'true', targetHandle: 'target' },
      { id: 'C-B', source: 'C', target: 'B', sourceHandle: 'true', targetHandle: 'target' },
      { id: 'A-J', source: 'A', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
      { id: 'B-J', source: 'B', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
      { id: 'J-M', source: 'J', target: 'M', sourceHandle: 'source', targetHandle: 'target' },
    ]

    // Nest (save)
    const nested = WorkflowTransform.nest(flatActivities, flatEdges)

    // Flatten again (reload)
    const { edges: reloadedEdges } = WorkflowTransform.flatten(nested)

    // J→M edge should be preserved
    const jToM = reloadedEdges.find((e) => e.source === 'J' && e.target === 'M')
    expect(jToM).toBeDefined()
    expect(jToM?.sourceHandle).toBe('source')
    expect(jToM?.targetHandle).toBe('target')

    // Should NOT create reverse edge
    const mToJ = reloadedEdges.find((e) => e.source === 'M' && e.target === 'J')
    expect(mToJ).toBeUndefined()
  })

  it('does not create converge→next edge when converge is last with no suitable next', () => {
    // Only C and J, no other activities
    const activities: Activity[] = [
      {
        id: 'C',
        name: 'C',
        then: [
          {
            id: 'A',
            name: 'A',
            task: {
              config: { code: 'a', language: 'python', environment: {}, timeout_seconds: 300 },
              executor: 'script',
            },
            type: 'task',
            requiresApproval: false,
          },
        ],
        type: 'condition',
        condition: { expression: 'c' },
        requiresApproval: false,
      },
      {
        id: 'J',
        name: 'J',
        type: 'converge',
        converge: {
          timeout: '',
          branches: ['A'],
          strategy: 'all',
          onTimeout: 'fail',
          aggregateOutputs: true,
        },
        requiresApproval: false,
      },
    ]

    const { edges } = WorkflowTransform.flatten(activities)

    // Should create A→J
    const aToJ = edges.find((e) => e.source === 'A' && e.target === 'J')
    expect(aToJ).toBeDefined()

    // Should NOT create any edge from J (no suitable next activity)
    const edgesFromJ = edges.filter((e) => e.source === 'J')
    expect(edgesFromJ).toHaveLength(0)
  })

  it('creates converge→next when converge is in middle of array', () => {
    // [C, J, M, N] - J should connect to M, M should connect to N
    const activities: Activity[] = [
      {
        id: 'C',
        name: 'C',
        then: [
          {
            id: 'A',
            name: 'A',
            task: {
              config: { code: 'a', language: 'python', environment: {}, timeout_seconds: 300 },
              executor: 'script',
            },
            type: 'task',
            requiresApproval: false,
          },
        ],
        type: 'condition',
        condition: { expression: 'c' },
        requiresApproval: false,
      },
      {
        id: 'J',
        name: 'J',
        type: 'converge',
        converge: {
          timeout: '',
          branches: ['A'],
          strategy: 'all',
          onTimeout: 'fail',
          aggregateOutputs: true,
        },
        requiresApproval: false,
      },
      {
        id: 'M',
        name: 'M',
        task: {
          config: { code: 'm', language: 'python', environment: {}, timeout_seconds: 300 },
          executor: 'script',
        },
        type: 'task',
        requiresApproval: false,
      },
      {
        id: 'N',
        name: 'N',
        task: {
          config: { code: 'n', language: 'python', environment: {}, timeout_seconds: 300 },
          executor: 'script',
        },
        type: 'task',
        requiresApproval: false,
      },
    ]

    const { edges } = WorkflowTransform.flatten(activities)

    // J→M
    const jToM = edges.find((e) => e.source === 'J' && e.target === 'M')
    expect(jToM).toBeDefined()

    // M→N
    const mToN = edges.find((e) => e.source === 'M' && e.target === 'N')
    expect(mToN).toBeDefined()
  })
})
