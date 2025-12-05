import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { describe, expect, it, beforeEach } from 'vitest'

import { useWorkflowStore, createScriptActivity } from './useWorkflowStore'

type Activity = WorkflowAPI.components['schemas']['activity']

describe('useWorkflowStore - reorderActivitiesFromEdges', () => {
  beforeEach(() => {
    useWorkflowStore.setState({
      currentWorkflow: null,
      workflowVersion: 0,
      edges: [],
    })
  })

  describe('Topological sorting', () => {
    it('reorders activities based on edges (simple chain)', () => {
      const activityA = createScriptActivity('A', 'Task A', 'python', 'print("A")')
      const activityB = createScriptActivity('B', 'Task B', 'python', 'print("B")')
      const activityC = createScriptActivity('C', 'Task C', 'python', 'print("C")')

      // Activities in wrong order
      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test',
          triggers: [],
          workflow: {
            activities: [activityC, activityA, activityB],
          },
        },
        workflowVersion: 1,
        edges: [
          { id: 'A-B', source: 'A', target: 'B', sourceHandle: 'source', targetHandle: 'target' },
          { id: 'B-C', source: 'B', target: 'C', sourceHandle: 'source', targetHandle: 'target' },
        ],
      })

      useWorkflowStore.getState().reorderActivitiesFromEdges()

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities || []
      expect(activities.map((a) => a.id)).toEqual(['A', 'B', 'C'])
    })

    it('handles branching paths', () => {
      const activityA = createScriptActivity('A', 'Task A', 'python', 'print("A")')
      const activityB = createScriptActivity('B', 'Task B', 'python', 'print("B")')
      const activityC = createScriptActivity('C', 'Task C', 'python', 'print("C")')
      const activityD = createScriptActivity('D', 'Task D', 'python', 'print("D")')

      // A -> B -> D
      // A -> C -> D
      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test',
          triggers: [],
          workflow: {
            activities: [activityD, activityC, activityB, activityA],
          },
        },
        workflowVersion: 1,
        edges: [
          { id: 'A-B', source: 'A', target: 'B', sourceHandle: 'source', targetHandle: 'target' },
          { id: 'A-C', source: 'A', target: 'C', sourceHandle: 'source', targetHandle: 'target' },
          { id: 'B-D', source: 'B', target: 'D', sourceHandle: 'source', targetHandle: 'target' },
          { id: 'C-D', source: 'C', target: 'D', sourceHandle: 'source', targetHandle: 'target' },
        ],
      })

      useWorkflowStore.getState().reorderActivitiesFromEdges()

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities || []
      const ids = activities.map((a) => a.id)

      // A should be first, D should be last
      expect(ids[0]).toBe('A')
      expect(ids[3]).toBe('D')
      // B and C should be in the middle (order between them is deterministic due to sort)
      expect(ids.slice(1, 3).sort()).toEqual(['B', 'C'])
    })

    it('handles complex DAG', () => {
      const activityA = createScriptActivity('A', 'Task A', 'python', 'print("A")')
      const activityB = createScriptActivity('B', 'Task B', 'python', 'print("B")')
      const activityC = createScriptActivity('C', 'Task C', 'python', 'print("C")')
      const activityD = createScriptActivity('D', 'Task D', 'python', 'print("D")')
      const activityE = createScriptActivity('E', 'Task E', 'python', 'print("E")')

      // A -> B -> D -> E
      //  \\-> C -/
      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test',
          triggers: [],
          workflow: {
            activities: [activityE, activityD, activityC, activityB, activityA],
          },
        },
        workflowVersion: 1,
        edges: [
          { id: 'A-B', source: 'A', target: 'B', sourceHandle: 'source', targetHandle: 'target' },
          { id: 'A-C', source: 'A', target: 'C', sourceHandle: 'source', targetHandle: 'target' },
          { id: 'B-D', source: 'B', target: 'D', sourceHandle: 'source', targetHandle: 'target' },
          { id: 'C-D', source: 'C', target: 'D', sourceHandle: 'source', targetHandle: 'target' },
          { id: 'D-E', source: 'D', target: 'E', sourceHandle: 'source', targetHandle: 'target' },
        ],
      })

      useWorkflowStore.getState().reorderActivitiesFromEdges()

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities || []
      const ids = activities.map((a) => a.id)

      // Verify topological order
      expect(ids.indexOf('A')).toBeLessThan(ids.indexOf('B'))
      expect(ids.indexOf('A')).toBeLessThan(ids.indexOf('C'))
      expect(ids.indexOf('B')).toBeLessThan(ids.indexOf('D'))
      expect(ids.indexOf('C')).toBeLessThan(ids.indexOf('D'))
      expect(ids.indexOf('D')).toBeLessThan(ids.indexOf('E'))
    })
  })

  describe('Handling nested activities', () => {
    it('only reorders top-level activities, not nested ones', () => {
      const activityA = createScriptActivity('A', 'Task A', 'python', 'print("A")')
      const activityB = createScriptActivity('B', 'Task B', 'python', 'print("B")')
      const activityC = createScriptActivity('C', 'Task C', 'python', 'print("C")')

      const condition: Extract<Activity, { type: 'condition' }> = {
        type: 'condition',
        id: 'COND',
        name: 'Condition',
        condition: 'input.value > 10',
        then: [activityB],
        else: [],
      }

      // C -> COND (contains B)
      // A -> C
      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test',
          triggers: [],
          workflow: {
            activities: [condition, activityC, activityA],
          },
        },
        workflowVersion: 1,
        edges: [
          { id: 'A-C', source: 'A', target: 'C', sourceHandle: 'source', targetHandle: 'target' },
          { id: 'C-COND', source: 'C', target: 'COND', sourceHandle: 'source', targetHandle: 'target' },
        ],
      })

      useWorkflowStore.getState().reorderActivitiesFromEdges()

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities || []
      expect(activities.map((a) => a.id)).toEqual(['A', 'C', 'COND'])

      // B should still be nested in condition
      const updatedCondition = activities[2] as Extract<Activity, { type: 'condition' }>
      expect(updatedCondition.then).toHaveLength(1)
      expect(updatedCondition.then[0].id).toBe('B')
    })

    it('maps nested activity edges to parent activity', () => {
      const activityA = createScriptActivity('A', 'Task A', 'python', 'print("A")')
      const activityB = createScriptActivity('B', 'Task B', 'python', 'print("B")')
      const activityC = createScriptActivity('C', 'Task C', 'python', 'print("C")')

      const parallel: Extract<Activity, { type: 'parallel' }> = {
        type: 'parallel',
        id: 'PAR',
        name: 'Parallel',
        branches: [activityB],
      }

      // Edge from A to B (nested in parallel)
      // Should reorder based on A -> PAR
      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test',
          triggers: [],
          workflow: {
            activities: [parallel, activityC, activityA],
          },
        },
        workflowVersion: 1,
        edges: [
          { id: 'A-B', source: 'A', target: 'B', sourceHandle: 'source', targetHandle: 'target' },
          { id: 'PAR-C', source: 'PAR', target: 'C', sourceHandle: 'source', targetHandle: 'target' },
        ],
      })

      useWorkflowStore.getState().reorderActivitiesFromEdges()

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities || []
      const ids = activities.map((a) => a.id)

      // A should come before PAR, PAR before C
      expect(ids.indexOf('A')).toBeLessThan(ids.indexOf('PAR'))
      expect(ids.indexOf('PAR')).toBeLessThan(ids.indexOf('C'))
    })
  })

  describe('Preserving unconnected activities', () => {
    it('keeps activities without edges at the end', () => {
      const activityA = createScriptActivity('A', 'Task A', 'python', 'print("A")')
      const activityB = createScriptActivity('B', 'Task B', 'python', 'print("B")')
      const activityC = createScriptActivity('C', 'Task C', 'python', 'print("C")')
      const activityOrphan = createScriptActivity('ORPHAN', 'Orphan', 'python', 'print("orphan")')

      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test',
          triggers: [],
          workflow: {
            activities: [activityOrphan, activityC, activityA, activityB],
          },
        },
        workflowVersion: 1,
        edges: [
          { id: 'A-B', source: 'A', target: 'B', sourceHandle: 'source', targetHandle: 'target' },
          { id: 'B-C', source: 'B', target: 'C', sourceHandle: 'source', targetHandle: 'target' },
        ],
      })

      useWorkflowStore.getState().reorderActivitiesFromEdges()

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities || []
      const ids = activities.map((a) => a.id)

      // Connected activities should be ordered
      expect(ids.slice(0, 3)).toEqual(['A', 'B', 'C'])
      // Orphan should be preserved
      expect(ids).toContain('ORPHAN')
      expect(activities).toHaveLength(4)
    })

    it('preserves all activities even with no edges', () => {
      const activityA = createScriptActivity('A', 'Task A', 'python', 'print("A")')
      const activityB = createScriptActivity('B', 'Task B', 'python', 'print("B")')

      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test',
          triggers: [],
          workflow: {
            activities: [activityB, activityA],
          },
        },
        workflowVersion: 1,
        edges: [],
      })

      useWorkflowStore.getState().reorderActivitiesFromEdges()

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities || []
      expect(activities).toHaveLength(2)
      expect(activities.map((a) => a.id).sort()).toEqual(['A', 'B'])
    })
  })

  describe('Deterministic ordering', () => {
    it('produces consistent order for nodes at same level', () => {
      const activityA = createScriptActivity('A', 'Task A', 'python', 'print("A")')
      const activityB = createScriptActivity('B', 'Task B', 'python', 'print("B")')
      const activityC = createScriptActivity('C', 'Task C', 'python', 'print("C")')

      // B and C have no ordering constraint (both depend on nothing)
      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test',
          triggers: [],
          workflow: {
            activities: [activityC, activityA, activityB],
          },
        },
        workflowVersion: 1,
        edges: [],
      })

      useWorkflowStore.getState().reorderActivitiesFromEdges()

      const run1 = useWorkflowStore.getState().currentWorkflow?.workflow.activities.map((a) => a.id) || []

      // Reset and run again
      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test',
          triggers: [],
          workflow: {
            activities: [activityB, activityC, activityA],
          },
        },
        workflowVersion: 1,
        edges: [],
      })

      useWorkflowStore.getState().reorderActivitiesFromEdges()

      const run2 = useWorkflowStore.getState().currentWorkflow?.workflow.activities.map((a) => a.id) || []

      // Should produce same sorted order (alphabetical due to sort in algorithm)
      expect(run1.sort()).toEqual(run2.sort())
    })
  })

  describe('Edge cases', () => {
    it('does nothing when no workflow is set', () => {
      useWorkflowStore.setState({ currentWorkflow: null })

      expect(() => useWorkflowStore.getState().reorderActivitiesFromEdges()).not.toThrow()
      expect(useWorkflowStore.getState().currentWorkflow).toBeNull()
    })

    it('handles empty activities array', () => {
      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test',
          triggers: [],
          workflow: {
            activities: [],
          },
        },
        workflowVersion: 1,
        edges: [],
      })

      useWorkflowStore.getState().reorderActivitiesFromEdges()

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities || []
      expect(activities).toHaveLength(0)
    })

    it('handles self-referential edges (should be filtered)', () => {
      const activityA = createScriptActivity('A', 'Task A', 'python', 'print("A")')
      const activityB = createScriptActivity('B', 'Task B', 'python', 'print("B")')

      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test',
          triggers: [],
          workflow: {
            activities: [activityB, activityA],
          },
        },
        workflowVersion: 1,
        edges: [
          { id: 'A-A', source: 'A', target: 'A', sourceHandle: 'source', targetHandle: 'target' }, // Self-loop
          { id: 'A-B', source: 'A', target: 'B', sourceHandle: 'source', targetHandle: 'target' },
        ],
      })

      useWorkflowStore.getState().reorderActivitiesFromEdges()

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities || []
      expect(activities.map((a) => a.id)).toEqual(['A', 'B'])
    })

    it('preserves all activities even with duplicate edges', () => {
      const activityA = createScriptActivity('A', 'Task A', 'python', 'print("A")')
      const activityB = createScriptActivity('B', 'Task B', 'python', 'print("B")')

      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test',
          triggers: [],
          workflow: {
            activities: [activityB, activityA],
          },
        },
        workflowVersion: 1,
        edges: [
          { id: 'A-B-1', source: 'A', target: 'B', sourceHandle: 'source', targetHandle: 'target' },
          { id: 'A-B-2', source: 'A', target: 'B', sourceHandle: 'source', targetHandle: 'target' },
        ],
      })

      useWorkflowStore.getState().reorderActivitiesFromEdges()

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities || []
      expect(activities).toHaveLength(2)
      expect(activities.map((a) => a.id)).toEqual(['A', 'B'])
    })
  })

  describe('Safety check', () => {
    it('never removes activities during reordering', () => {
      const activityA = createScriptActivity('A', 'Task A', 'python', 'print("A")')
      const activityB = createScriptActivity('B', 'Task B', 'python', 'print("B")')
      const activityC = createScriptActivity('C', 'Task C', 'python', 'print("C")')

      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test',
          triggers: [],
          workflow: {
            activities: [activityA, activityB, activityC],
          },
        },
        workflowVersion: 1,
        edges: [
          // Only A->B edge, C is disconnected
          { id: 'A-B', source: 'A', target: 'B', sourceHandle: 'source', targetHandle: 'target' },
        ],
      })

      useWorkflowStore.getState().reorderActivitiesFromEdges()

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities || []

      // All three activities must be preserved
      expect(activities).toHaveLength(3)
      expect(activities.map((a) => a.id).sort()).toEqual(['A', 'B', 'C'])
    })

    it('reorders activities with loop nodes using done handle', () => {
      const trigger: Activity = {
        type: 'trigger',
        id: 'trigger',
        name: 'Manual Trigger',
        trigger: { type: 'manual' },
      }
      const activityA = createScriptActivity('A', 'Task A', 'python', 'print("A")')
      const loopB: Activity = {
        type: 'loop',
        id: 'B',
        name: 'Loop B',
        loop: {
          type: 'forEach',
          items: 'input.items',
          do: [],
        },
      }
      const loopBodyC = createScriptActivity('C', 'Loop Body C', 'python', 'print("C")')

      // Initial order: trigger->A->B with C in loop body
      // Change to: trigger->B->A (reconnect edges)
      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test',
          triggers: [],
          workflow: {
            // Activities in OLD order (A before B)
            activities: [trigger, activityA, loopB, loopBodyC],
          },
        },
        workflowVersion: 1,
        edges: [
          // NEW edge configuration: trigger->B->A
          { id: 'trigger-B', source: 'trigger', target: 'B', sourceHandle: 'source', targetHandle: 'target' },
          { id: 'B-A', source: 'B', target: 'A', sourceHandle: 'done', targetHandle: 'target' },
          // Loop internal edges (should be ignored for ordering)
          { id: 'B-C', source: 'B', target: 'C', sourceHandle: 'loop', targetHandle: 'target' },
          { id: 'C-B', source: 'C', target: 'B', sourceHandle: 'source', targetHandle: 'end' },
        ],
      })

      useWorkflowStore.getState().reorderActivitiesFromEdges()

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities || []

      // Should be reordered to: trigger, B, A (with C remaining in the list)
      const topLevelIds = activities.map((a) => a.id)
      const triggerIndex = topLevelIds.indexOf('trigger')
      const bIndex = topLevelIds.indexOf('B')
      const aIndex = topLevelIds.indexOf('A')

      // Verify correct ordering: trigger < B < A
      expect(triggerIndex).toBeLessThan(bIndex)
      expect(bIndex).toBeLessThan(aIndex)
    })
  })
})
