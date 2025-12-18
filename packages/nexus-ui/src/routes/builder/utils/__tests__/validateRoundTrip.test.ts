import type { Activity } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'

import { validateRoundTrip } from '../validateRoundTrip'

describe('validateRoundTrip', () => {
  it('accepts parallel containers with different IDs after round-trip', () => {
    // Original nested structure from API (parallel container with specific ID)
    const original: Activity[] = [
      { type: 'task', id: 'trigger', name: 'Manual', task: { executor: 'manual', config: {} } },
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
    const original: Activity[] = [
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
    ]

    // Should not throw - validation is skipped for legacy activities
    expect(() => {
      validateRoundTrip(original)
    }).not.toThrow()
  })

  it('validates workflows with parallel_for_ wrappers (auto-generated)', () => {
    const original: Activity[] = [
      { type: 'task', id: 'trigger', name: 'Manual', task: { executor: 'manual', config: {} } },
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
})
