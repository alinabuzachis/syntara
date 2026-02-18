import type { Activity } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'

import { buildNestedConditionStructure } from './buildNestedStructure'
import { loadWorkflow } from './loadWorkflow'

/**
 * Integration tests for the full approval node workflow:
 * 1. Load nested structure from API
 * 2. Flatten for editing (generateEdges + flatten)
 * 3. Save back to API (buildNested)
 * 4. Verify round-trip preserves structure
 */
describe('Approval Node Integration', () => {
  describe('Simple approval round-trip', () => {
    it('preserves simple approval with onApproved branch', () => {
      // Simulates a workflow from the API with nested structure
      const nestedWorkflow: Activity[] = [
        {
          type: 'approval',
          id: 'A',
          name: 'Approval A',
          approval: {
            prompt: 'Please approve',
            timeout: 3600,
            approvers: ['user1', 'user2'],
            onTimeout: 'fail',
          },
          onApproved: [
            {
              type: 'task',
              id: 'B',
              name: 'Task B',
              task: { executor: 'script', config: { language: 'python', code: 'print("B")' } },
            },
          ],
        },
      ]

      // Step 1: Load from API - use combined load function (generates edges AND flattens)
      const { activities: flatActivities, edges } = loadWorkflow(nestedWorkflow)

      // Verify flat structure
      expect(flatActivities).toHaveLength(2)
      expect(flatActivities[0].id).toBe('A')
      expect((flatActivities[0] as Extract<Activity, { type: 'approval' }>).onApproved).toEqual([])
      expect(flatActivities[1].id).toBe('B')

      // Verify edges captured the relationship
      expect(edges).toHaveLength(1)
      expect(edges[0]).toMatchObject({
        source: 'A',
        target: 'B',
        sourceHandle: 'approved',
        targetHandle: 'target',
      })

      // Step 2: Save to API - rebuild nested structure
      const rebuiltNested = buildNestedConditionStructure(flatActivities, edges)

      // Verify round-trip preserves structure
      expect(rebuiltNested).toHaveLength(1)
      expect(rebuiltNested[0].type).toBe('approval')
      const approval = rebuiltNested[0] as Extract<Activity, { type: 'approval' }>
      expect(approval.onApproved).toHaveLength(1)
      expect(approval.onApproved[0].id).toBe('B')
    })

    it('preserves approval with onApproved and onRejected branches', () => {
      const nestedWorkflow: Activity[] = [
        {
          type: 'approval',
          id: 'A',
          name: 'Approval A',
          approval: {
            prompt: 'Please approve',
            timeout: 3600,
            approvers: ['user1'],
            onTimeout: 'fail',
          },
          onApproved: [
            {
              type: 'task',
              id: 'B',
              name: 'Task B',
              task: { executor: 'script', config: { language: 'python', code: 'print("B")' } },
            },
          ],
          onRejected: [
            {
              type: 'task',
              id: 'C',
              name: 'Task C',
              task: { executor: 'script', config: { language: 'python', code: 'print("C")' } },
            },
          ],
        },
      ]

      const { activities: flatActivities, edges } = loadWorkflow(nestedWorkflow)

      // Verify edges for both branches
      expect(edges).toHaveLength(2)
      expect(edges.some((e) => e.source === 'A' && e.target === 'B' && e.sourceHandle === 'approved')).toBe(true)
      expect(edges.some((e) => e.source === 'A' && e.target === 'C' && e.sourceHandle === 'rejected')).toBe(true)

      // Round-trip
      const rebuiltNested = buildNestedConditionStructure(flatActivities, edges)

      expect(rebuiltNested).toHaveLength(1)
      const approval = rebuiltNested[0] as Extract<Activity, { type: 'approval' }>
      expect(approval.onApproved).toHaveLength(1)
      expect(approval.onApproved[0].id).toBe('B')
      expect(approval.onRejected).toHaveLength(1)
      expect(approval.onRejected![0].id).toBe('C')
    })

    it('handles nested approval -> condition -> task', () => {
      const nestedWorkflow: Activity[] = [
        {
          type: 'approval',
          id: 'A',
          name: 'Approval A',
          approval: {
            prompt: 'Approve deployment?',
            timeout: 3600,
            approvers: ['deployer'],
            onTimeout: 'fail',
          },
          onApproved: [
            {
              type: 'condition',
              id: 'B',
              name: 'Condition B',
              condition: 'env === "production"',
              then: [
                {
                  type: 'task',
                  id: 'C',
                  name: 'Task C',
                  task: { executor: 'script', config: { language: 'python', code: 'deploy()' } },
                },
              ],
              else: [],
            },
          ],
        },
      ]

      const { activities: flatActivities, edges } = loadWorkflow(nestedWorkflow)

      // Should have 3 activities: Approval, Condition, Task
      expect(flatActivities).toHaveLength(3)
      expect(flatActivities.map((a) => a.id)).toEqual(['A', 'B', 'C'])

      // Should have 2 edges:
      // - Approval(A) --approved--> Condition(B)
      // - Condition(B) --true--> Task(C)
      expect(edges).toHaveLength(2)
      expect(edges.find((e) => e.source === 'A' && e.target === 'B')).toMatchObject({
        sourceHandle: 'approved',
      })
      expect(edges.find((e) => e.source === 'B' && e.target === 'C')).toMatchObject({
        sourceHandle: 'true',
      })

      // Round-trip
      const rebuiltNested = buildNestedConditionStructure(flatActivities, edges)

      // Should rebuild the nested structure
      expect(rebuiltNested).toHaveLength(1)
      const approval = rebuiltNested[0] as Extract<Activity, { type: 'approval' }>
      expect(approval.id).toBe('A')
      expect(approval.onApproved).toHaveLength(1)

      const condition = approval.onApproved[0] as Extract<Activity, { type: 'condition' }>
      expect(condition.id).toBe('B')
      expect(condition.then).toHaveLength(1)
      expect(condition.then[0].id).toBe('C')
    })

    it('preserves approval with sequential task in onApproved branch', () => {
      // Test scenario: Approval with onApproved containing two sequential tasks
      const nestedWorkflow: Activity[] = [
        {
          type: 'approval',
          id: 'A',
          name: 'Approval A',
          approval: {
            prompt: 'Approve?',
            timeout: 3600,
            approvers: ['user1'],
            onTimeout: 'fail',
          },
          onApproved: [
            {
              type: 'task',
              id: 'B',
              name: 'Task B',
              task: { executor: 'script', config: { language: 'python', code: 'print("B")' } },
            },
            {
              type: 'task',
              id: 'C',
              name: 'Task C',
              task: { executor: 'script', config: { language: 'python', code: 'print("C")' } },
            },
          ],
        },
      ]

      const { activities: flatActivities, edges } = loadWorkflow(nestedWorkflow)

      // Should have 3 activities
      expect(flatActivities).toHaveLength(3)

      // Should have 2 edges:
      // - Approval(A) --approved--> Task(B)
      // - Task(B) --source--> Task(C)
      expect(edges).toHaveLength(2)
      const approvedEdge = edges.find((e) => e.source === 'A' && e.target === 'B')
      expect(approvedEdge).toMatchObject({
        sourceHandle: 'approved',
      })
      const sequentialEdge = edges.find((e) => e.source === 'B' && e.target === 'C')
      expect(sequentialEdge).toMatchObject({
        sourceHandle: 'source',
      })

      // Round-trip
      const rebuiltNested = buildNestedConditionStructure(flatActivities, edges)

      // Should have approval with both tasks in onApproved branch
      expect(rebuiltNested).toHaveLength(1)
      const approval = rebuiltNested[0] as Extract<Activity, { type: 'approval' }>
      expect(approval.onApproved).toHaveLength(2)
      expect(approval.onApproved[0].id).toBe('B')
      expect(approval.onApproved[1].id).toBe('C')
    })
  })
})
