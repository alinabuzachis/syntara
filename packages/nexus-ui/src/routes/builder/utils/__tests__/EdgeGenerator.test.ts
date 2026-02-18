import { ActivityTypeEnum, EdgeHandleEnum, type Activity } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'
import type { EdgeConnection } from '../../types/edge'

import { EdgeGenerator } from '../EdgeGenerator'

describe('EdgeGenerator', () => {
  describe('getSourceHandle', () => {
    it('returns "done" for loop activities', () => {
      const loopActivity: Activity = {
        type: ActivityTypeEnum.LOOP,
        id: 'loop-1',
        name: 'Loop',
        loop: {
          items: '{{items}}',
        },
        do: [],
      }

      expect(EdgeGenerator.getSourceHandle(loopActivity)).toBe('done')
    })

    it('returns "source" for non-loop activities', () => {
      const taskActivity: Activity = {
        type: ActivityTypeEnum.TASK,
        id: 'task-1',
        name: 'Task',
        task: {
          executor: 'script',
          config: {
            language: 'python',
            code: 'print("test")',
          },
        },
      }

      expect(EdgeGenerator.getSourceHandle(taskActivity)).toBe('source')
    })
  })

  describe('createApprovalBranchEdge', () => {
    it('creates edge for approval with regular activity in approved branch', () => {
      const edges: EdgeConnection[] = []
      const branchActivities: Activity[] = [
        {
          type: ActivityTypeEnum.TASK,
          id: 'task-1',
          name: 'Task',
          task: {
            executor: 'script',
            config: {
              language: 'python',
              code: 'print("approved")',
            },
          },
        },
      ]

      EdgeGenerator.createApprovalBranchEdge('approval-1', branchActivities, EdgeHandleEnum.APPROVED, edges)

      expect(edges).toHaveLength(1)
      expect(edges[0]).toEqual({
        id: 'approval-1-approved-task-1',
        source: 'approval-1',
        target: 'task-1',
        sourceHandle: EdgeHandleEnum.APPROVED,
        targetHandle: 'target',
      })
    })

    it('creates edge for approval with regular activity in rejected branch', () => {
      const edges: EdgeConnection[] = []
      const branchActivities: Activity[] = [
        {
          type: ActivityTypeEnum.TASK,
          id: 'task-2',
          name: 'Rejected Task',
          task: {
            executor: 'script',
            config: {
              language: 'python',
              code: 'print("rejected")',
            },
          },
        },
      ]

      EdgeGenerator.createApprovalBranchEdge('approval-1', branchActivities, EdgeHandleEnum.REJECTED, edges)

      expect(edges).toHaveLength(1)
      expect(edges[0]).toEqual({
        id: 'approval-1-rejected-task-2',
        source: 'approval-1',
        target: 'task-2',
        sourceHandle: EdgeHandleEnum.REJECTED,
        targetHandle: 'target',
      })
    })

    it('creates edges to all branches when first activity is parallel', () => {
      const edges: EdgeConnection[] = []
      const branchActivities: Activity[] = [
        {
          type: ActivityTypeEnum.PARALLEL,
          id: 'parallel-1',
          name: 'Parallel',
          branches: [
            {
              type: ActivityTypeEnum.TASK,
              id: 'task-1',
              name: 'Task 1',
              task: {
                executor: 'script',
                config: {
                  language: 'python',
                  code: 'print("1")',
                },
              },
            },
            {
              type: ActivityTypeEnum.TASK,
              id: 'task-2',
              name: 'Task 2',
              task: {
                executor: 'script',
                config: {
                  language: 'python',
                  code: 'print("2")',
                },
              },
            },
          ],
        },
      ]

      EdgeGenerator.createApprovalBranchEdge('approval-1', branchActivities, EdgeHandleEnum.APPROVED, edges)

      expect(edges).toHaveLength(2)
      expect(edges[0]).toEqual({
        id: 'approval-1-approved-task-1',
        source: 'approval-1',
        target: 'task-1',
        sourceHandle: EdgeHandleEnum.APPROVED,
        targetHandle: 'target',
      })
      expect(edges[1]).toEqual({
        id: 'approval-1-approved-task-2',
        source: 'approval-1',
        target: 'task-2',
        sourceHandle: EdgeHandleEnum.APPROVED,
        targetHandle: 'target',
      })
    })

    it('does not create edges for empty branch', () => {
      const edges: EdgeConnection[] = []
      const branchActivities: Activity[] = []

      EdgeGenerator.createApprovalBranchEdge('approval-1', branchActivities, EdgeHandleEnum.APPROVED, edges)

      expect(edges).toHaveLength(0)
    })
  })

  describe('createParallelToNextEdges', () => {
    it('creates edges from parallel branches to next activity (full convergence)', () => {
      const parallel: Extract<Activity, { type: 'parallel' }> = {
        type: ActivityTypeEnum.PARALLEL,
        id: 'parallel-1',
        name: 'Parallel',
        branches: [
          {
            type: ActivityTypeEnum.TASK,
            id: 'task-1',
            name: 'Task 1',
            task: {
              executor: 'script',
              config: {
                language: 'python',
                code: 'print("1")',
              },
            },
          },
          {
            type: ActivityTypeEnum.TASK,
            id: 'task-2',
            name: 'Task 2',
            task: {
              executor: 'script',
              config: {
                language: 'python',
                code: 'print("2")',
              },
            },
          },
        ],
      }

      const nextActivity: Activity = {
        type: ActivityTypeEnum.TASK,
        id: 'task-3',
        name: 'Task 3',
        task: {
          executor: 'script',
          config: {
            language: 'python',
            code: 'print("3")',
          },
        },
      }

      const edges: EdgeConnection[] = []
      EdgeGenerator.createParallelToNextEdges(parallel, nextActivity, edges)

      expect(edges).toHaveLength(2)
      expect(edges[0]).toMatchObject({
        source: 'task-1',
        target: 'task-3',
      })
      expect(edges[1]).toMatchObject({
        source: 'task-2',
        target: 'task-3',
      })
    })

    it('creates edges from parallel branches to converge node (partial convergence)', () => {
      const parallel: Extract<Activity, { type: 'parallel' }> = {
        type: ActivityTypeEnum.PARALLEL,
        id: 'parallel-1',
        name: 'Parallel',
        branches: [
          {
            type: ActivityTypeEnum.TASK,
            id: 'task-1',
            name: 'Task 1',
            task: {
              executor: 'script',
              config: {
                language: 'python',
                code: 'print("1")',
              },
            },
          },
          {
            type: ActivityTypeEnum.TASK,
            id: 'task-2',
            name: 'Task 2',
            task: {
              executor: 'script',
              config: {
                language: 'python',
                code: 'print("2")',
              },
            },
          },
        ],
      }

      const convergeNode: Activity = {
        type: ActivityTypeEnum.CONVERGE,
        id: 'converge-1',
        name: 'Converge',
        converge: {
          branches: ['task-1'], // Only task-1 converges
        },
      }

      const edges: EdgeConnection[] = []
      EdgeGenerator.createParallelToNextEdges(parallel, convergeNode, edges)

      // Only task-1 should have an edge to converge node
      expect(edges).toHaveLength(1)
      expect(edges[0]).toMatchObject({
        source: 'task-1',
        target: 'converge-1',
      })
    })
  })

  describe('createConditionBranchEdge', () => {
    it('creates edge for condition with regular activity in then branch', () => {
      const edges: EdgeConnection[] = []
      const branchActivities: Activity[] = [
        {
          type: ActivityTypeEnum.TASK,
          id: 'task-1',
          name: 'Task',
          task: {
            executor: 'script',
            config: {
              language: 'python',
              code: 'print("then")',
            },
          },
        },
      ]

      EdgeGenerator.createConditionBranchEdge('condition-1', branchActivities, 'true', edges)

      expect(edges).toHaveLength(1)
      expect(edges[0]).toEqual({
        id: 'condition-1-true-task-1',
        source: 'condition-1',
        target: 'task-1',
        sourceHandle: 'true',
        targetHandle: 'target',
      })
    })

    it('creates edges to all branches when first activity is parallel', () => {
      const edges: EdgeConnection[] = []
      const branchActivities: Activity[] = [
        {
          type: ActivityTypeEnum.PARALLEL,
          id: 'parallel-1',
          name: 'Parallel',
          branches: [
            {
              type: ActivityTypeEnum.TASK,
              id: 'task-1',
              name: 'Task 1',
              task: {
                executor: 'script',
                config: {
                  language: 'python',
                  code: 'print("1")',
                },
              },
            },
            {
              type: ActivityTypeEnum.TASK,
              id: 'task-2',
              name: 'Task 2',
              task: {
                executor: 'script',
                config: {
                  language: 'python',
                  code: 'print("2")',
                },
              },
            },
          ],
        },
      ]

      EdgeGenerator.createConditionBranchEdge('condition-1', branchActivities, 'false', edges)

      expect(edges).toHaveLength(2)
      expect(edges[0]).toEqual({
        id: 'condition-1-false-task-1',
        source: 'condition-1',
        target: 'task-1',
        sourceHandle: 'false',
        targetHandle: 'target',
      })
      expect(edges[1]).toEqual({
        id: 'condition-1-false-task-2',
        source: 'condition-1',
        target: 'task-2',
        sourceHandle: 'false',
        targetHandle: 'target',
      })
    })

    it('does not create edges for empty branch', () => {
      const edges: EdgeConnection[] = []
      const branchActivities: Activity[] = []

      EdgeGenerator.createConditionBranchEdge('condition-1', branchActivities, 'true', edges)

      expect(edges).toHaveLength(0)
    })
  })

  describe('generateSequentialEdges', () => {
    it('skips approval nodes when generating sequential edges', () => {
      const activities: Activity[] = [
        {
          type: ActivityTypeEnum.APPROVAL,
          id: 'approval-1',
          name: 'Approval',
          approval: {
            approvers: ['user1'],
            prompt: 'Approve?',
          },
          onApproved: [],
          onRejected: [],
        },
        {
          type: ActivityTypeEnum.TASK,
          id: 'task-1',
          name: 'Task',
          task: {
            executor: 'script',
            config: {
              language: 'python',
              code: 'print("test")',
            },
          },
        },
      ]

      const edges: EdgeConnection[] = []
      EdgeGenerator.generateSequentialEdges(activities, edges)

      // Should not create edge from approval to task (approval nodes are skipped)
      expect(edges).toHaveLength(0)
    })

    it('creates sequential edges between regular tasks', () => {
      const activities: Activity[] = [
        {
          type: ActivityTypeEnum.TASK,
          id: 'task-1',
          name: 'Task 1',
          task: {
            executor: 'script',
            config: {
              language: 'python',
              code: 'print("1")',
            },
          },
        },
        {
          type: ActivityTypeEnum.TASK,
          id: 'task-2',
          name: 'Task 2',
          task: {
            executor: 'script',
            config: {
              language: 'python',
              code: 'print("2")',
            },
          },
        },
      ]

      const edges: EdgeConnection[] = []
      EdgeGenerator.generateSequentialEdges(activities, edges)

      expect(edges).toHaveLength(1)
      expect(edges[0]).toMatchObject({
        source: 'task-1',
        target: 'task-2',
      })
    })

    it('creates edges from task to all parallel branches', () => {
      const activities: Activity[] = [
        {
          type: ActivityTypeEnum.TASK,
          id: 'task-1',
          name: 'Task 1',
          task: {
            executor: 'script',
            config: {
              language: 'python',
              code: 'print("1")',
            },
          },
        },
        {
          type: ActivityTypeEnum.PARALLEL,
          id: 'parallel-1',
          name: 'Parallel',
          branches: [
            {
              type: ActivityTypeEnum.TASK,
              id: 'task-2',
              name: 'Task 2',
              task: {
                executor: 'script',
                config: {
                  language: 'python',
                  code: 'print("2")',
                },
              },
            },
            {
              type: ActivityTypeEnum.TASK,
              id: 'task-3',
              name: 'Task 3',
              task: {
                executor: 'script',
                config: {
                  language: 'python',
                  code: 'print("3")',
                },
              },
            },
          ],
        },
      ]

      const edges: EdgeConnection[] = []
      EdgeGenerator.generateSequentialEdges(activities, edges)

      expect(edges).toHaveLength(2)
      expect(edges[0]).toMatchObject({
        source: 'task-1',
        target: 'task-2',
      })
      expect(edges[1]).toMatchObject({
        source: 'task-1',
        target: 'task-3',
      })
    })

    it('skips condition nodes when generating sequential edges', () => {
      const activities: Activity[] = [
        {
          type: ActivityTypeEnum.CONDITION,
          id: 'condition-1',
          name: 'Condition',
          condition: {
            expression: '{{value}} > 10',
          },
          then: [],
          else: [],
        },
        {
          type: ActivityTypeEnum.TASK,
          id: 'task-1',
          name: 'Task',
          task: {
            executor: 'script',
            config: {
              language: 'python',
              code: 'print("test")',
            },
          },
        },
      ]

      const edges: EdgeConnection[] = []
      EdgeGenerator.generateSequentialEdges(activities, edges)

      // Should not create edge from condition to task (condition nodes are skipped)
      expect(edges).toHaveLength(0)
    })

    it('creates edges from parallel to next activity using createParallelToNextEdges', () => {
      const activities: Activity[] = [
        {
          type: ActivityTypeEnum.PARALLEL,
          id: 'parallel-1',
          name: 'Parallel',
          branches: [
            {
              type: ActivityTypeEnum.TASK,
              id: 'task-1',
              name: 'Task 1',
              task: {
                executor: 'script',
                config: {
                  language: 'python',
                  code: 'print("1")',
                },
              },
            },
            {
              type: ActivityTypeEnum.TASK,
              id: 'task-2',
              name: 'Task 2',
              task: {
                executor: 'script',
                config: {
                  language: 'python',
                  code: 'print("2")',
                },
              },
            },
          ],
        },
        {
          type: ActivityTypeEnum.TASK,
          id: 'task-3',
          name: 'Task 3',
          task: {
            executor: 'script',
            config: {
              language: 'python',
              code: 'print("3")',
            },
          },
        },
      ]

      const edges: EdgeConnection[] = []
      EdgeGenerator.generateSequentialEdges(activities, edges)

      // Should create edges from both parallel branches to task-3
      expect(edges).toHaveLength(2)
      expect(edges[0]).toMatchObject({
        source: 'task-1',
        target: 'task-3',
      })
      expect(edges[1]).toMatchObject({
        source: 'task-2',
        target: 'task-3',
      })
    })
  })
})
