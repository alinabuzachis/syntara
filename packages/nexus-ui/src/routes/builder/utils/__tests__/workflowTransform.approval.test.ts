import { EdgeHandleEnum } from '@ansible/nexus-contracts'
import type { Activity, EdgeConnection } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'

import { WorkflowTransform } from '../workflowTransform'

describe('WorkflowTransform - Approval Nodes', () => {
  describe('flatten - approval nodes', () => {
    it('flattens approval node with approved and rejected branches', () => {
      const nestedActivities: Activity[] = [
        {
          type: 'approval',
          id: 'approval-1',
          name: 'Approval',
          approval: {
            approvers: ['user1'],
            prompt: 'Approve?',
          },
          onApproved: [
            {
              type: 'task',
              id: 'task-1',
              name: 'Approved Task',
              task: {
                executor: 'script',
                config: {
                  language: 'python',
                  code: 'print("approved")',
                },
              },
            },
          ],
          onRejected: [
            {
              type: 'task',
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
          ],
        },
      ]

      const { activities, edges } = WorkflowTransform.flatten(nestedActivities)

      // Should have 3 activities: approval + 2 tasks
      expect(activities).toHaveLength(3)

      // Approval node should have empty branches
      const approvalNode = activities.find((a) => a.id === 'approval-1')
      expect(approvalNode).toBeDefined()
      expect(approvalNode?.type).toBe('approval')
      if (approvalNode?.type === 'approval') {
        expect(approvalNode.onApproved).toEqual([])
        expect(approvalNode.onRejected).toEqual([])
      }

      // Should have edges for both branches
      expect(edges).toContainEqual(
        expect.objectContaining({
          source: 'approval-1',
          sourceHandle: EdgeHandleEnum.APPROVED,
          target: 'task-1',
        })
      )
      expect(edges).toContainEqual(
        expect.objectContaining({
          source: 'approval-1',
          sourceHandle: EdgeHandleEnum.REJECTED,
          target: 'task-2',
        })
      )
    })

    it('flattens approval node with only approved branch', () => {
      const nestedActivities: Activity[] = [
        {
          type: 'approval',
          id: 'approval-1',
          name: 'Approval',
          approval: {
            approvers: ['user1'],
            prompt: 'Approve?',
          },
          onApproved: [
            {
              type: 'task',
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
          ],
          onRejected: [],
        },
      ]

      const { activities, edges } = WorkflowTransform.flatten(nestedActivities)

      expect(activities).toHaveLength(2)
      expect(edges).toContainEqual(
        expect.objectContaining({
          source: 'approval-1',
          sourceHandle: EdgeHandleEnum.APPROVED,
          target: 'task-1',
        })
      )
      expect(edges).not.toContainEqual(
        expect.objectContaining({
          source: 'approval-1',
          sourceHandle: EdgeHandleEnum.REJECTED,
        })
      )
    })

    it('flattens nested approval within approval branches', () => {
      const nestedActivities: Activity[] = [
        {
          type: 'approval',
          id: 'approval-1',
          name: 'First Approval',
          approval: {
            approvers: ['user1'],
            prompt: 'First approval?',
          },
          onApproved: [
            {
              type: 'approval',
              id: 'approval-2',
              name: 'Second Approval',
              approval: {
                approvers: ['user2'],
                prompt: 'Second approval?',
              },
              onApproved: [
                {
                  type: 'task',
                  id: 'task-1',
                  name: 'Task',
                  task: {
                    executor: 'script',
                    config: {
                      language: 'python',
                      code: 'print("done")',
                    },
                  },
                },
              ],
              onRejected: [],
            },
          ],
          onRejected: [],
        },
      ]

      const { activities, edges } = WorkflowTransform.flatten(nestedActivities)

      expect(activities).toHaveLength(3)
      expect(edges).toContainEqual(
        expect.objectContaining({
          source: 'approval-1',
          sourceHandle: EdgeHandleEnum.APPROVED,
          target: 'approval-2',
        })
      )
      expect(edges).toContainEqual(
        expect.objectContaining({
          source: 'approval-2',
          sourceHandle: EdgeHandleEnum.APPROVED,
          target: 'task-1',
        })
      )
    })
  })

  describe('nest - approval nodes', () => {
    it('nests approval node with approved and rejected branches', () => {
      const flatActivities: Activity[] = [
        {
          type: 'approval',
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
          type: 'task',
          id: 'task-1',
          name: 'Approved Task',
          task: {
            executor: 'script',
            config: {
              language: 'python',
              code: 'print("approved")',
            },
          },
        },
        {
          type: 'task',
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

      const edges: EdgeConnection[] = [
        {
          source: 'approval-1',
          sourceHandle: EdgeHandleEnum.APPROVED,
          target: 'task-1',
        },
        {
          source: 'approval-1',
          sourceHandle: EdgeHandleEnum.REJECTED,
          target: 'task-2',
        },
      ]

      const nested = WorkflowTransform.nest(flatActivities, edges)

      expect(nested).toHaveLength(1)
      const approvalNode = nested[0]
      expect(approvalNode.type).toBe('approval')
      if (approvalNode.type === 'approval') {
        expect(approvalNode.onApproved).toHaveLength(1)
        expect(approvalNode.onApproved?.[0].id).toBe('task-1')
        expect(approvalNode.onRejected).toHaveLength(1)
        expect(approvalNode.onRejected?.[0].id).toBe('task-2')
      }
    })

    it('nests multiple activities in approved branch', () => {
      const flatActivities: Activity[] = [
        {
          type: 'approval',
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
          type: 'task',
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
          type: 'task',
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

      const edges: EdgeConnection[] = [
        {
          source: 'approval-1',
          sourceHandle: EdgeHandleEnum.APPROVED,
          target: 'task-1',
        },
        {
          source: 'task-1',
          target: 'task-2',
        },
      ]

      const nested = WorkflowTransform.nest(flatActivities, edges)

      expect(nested).toHaveLength(1)
      const approvalNode = nested[0]
      if (approvalNode.type === 'approval') {
        expect(approvalNode.onApproved).toHaveLength(2)
        expect(approvalNode.onApproved?.[0].id).toBe('task-1')
        expect(approvalNode.onApproved?.[1].id).toBe('task-2')
        // When no rejected activities, onRejected should be undefined (not empty array)
        expect(approvalNode.onRejected).toBeUndefined()
      }
    })
  })

  describe('round-trip - approval nodes', () => {
    it('preserves approval structure through flatten and nest', () => {
      const original: Activity[] = [
        {
          type: 'approval',
          id: 'approval-1',
          name: 'Deployment Approval',
          approval: {
            approvers: ['admin', 'manager'],
            prompt: 'Approve deployment?',
            timeout: 3600,
            onTimeout: 'fail',
          },
          onApproved: [
            {
              type: 'task',
              id: 'deploy-task',
              name: 'Deploy',
              task: {
                executor: 'script',
                config: {
                  language: 'bash',
                  code: './deploy.sh',
                },
              },
            },
          ],
          onRejected: [
            {
              type: 'task',
              id: 'notify-task',
              name: 'Notify Rejection',
              task: {
                executor: 'api',
                config: {
                  method: 'POST',
                  url: 'https://notify.example.com',
                },
              },
            },
          ],
        },
      ]

      const { activities, edges } = WorkflowTransform.flatten(original)
      const nested = WorkflowTransform.nest(activities, edges)

      expect(nested).toEqual(original)
    })

    it('sets onRejected to undefined when empty after nesting', () => {
      // Test that empty onRejected array becomes undefined (not empty array)
      const flatActivities: Activity[] = [
        {
          type: 'approval',
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
          type: 'task',
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

      const edges: EdgeConnection[] = [
        {
          source: 'approval-1',
          sourceHandle: EdgeHandleEnum.APPROVED,
          target: 'task-1',
        },
      ]

      const nested = WorkflowTransform.nest(flatActivities, edges)

      expect(nested).toHaveLength(1)
      const approvalNode = nested[0]
      if (approvalNode.type === 'approval') {
        expect(approvalNode.onApproved).toHaveLength(1)
        expect(approvalNode.onApproved?.[0].id).toBe('task-1')
        // When no rejected activities, onRejected should be undefined (not empty array)
        expect(approvalNode.onRejected).toBeUndefined()
      }
    })

    it('handles approval with only rejected branch (empty approved)', () => {
      // Test approval node with only rejected branch
      const flatActivities: Activity[] = [
        {
          type: 'approval',
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
          type: 'task',
          id: 'task-rejected',
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

      const edges: EdgeConnection[] = [
        {
          source: 'approval-1',
          sourceHandle: EdgeHandleEnum.REJECTED,
          target: 'task-rejected',
        },
      ]

      const nested = WorkflowTransform.nest(flatActivities, edges)

      expect(nested).toHaveLength(1)
      const approvalNode = nested[0]
      if (approvalNode.type === 'approval') {
        // onApproved should be empty array when no approved activities
        expect(approvalNode.onApproved).toEqual([])
        // onRejected should have the rejected task
        expect(approvalNode.onRejected).toHaveLength(1)
        expect(approvalNode.onRejected?.[0].id).toBe('task-rejected')
      }
    })
  })
})
