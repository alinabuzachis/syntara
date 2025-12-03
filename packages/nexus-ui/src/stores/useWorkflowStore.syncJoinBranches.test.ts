import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { describe, expect, it, beforeEach } from 'vitest'

import { useWorkflowStore, createScriptActivity, createJoinActivity } from './useWorkflowStore'

type Activity = WorkflowAPI.components['schemas']['activity']

describe('useWorkflowStore - syncJoinBranches', () => {
  beforeEach(() => {
    useWorkflowStore.setState({
      currentWorkflow: null,
      workflowVersion: 0,
      edges: [],
    })
  })

  describe('Join with 2+ incoming edges', () => {
    it('creates parallel container for two branches', () => {
      const activityB = createScriptActivity('B', 'Task B', 'python', 'print("B")')
      const activityC = createScriptActivity('C', 'Task C', 'python', 'print("C")')
      const joinActivity = createJoinActivity('J', 'Join J', 'all')

      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test',
          triggers: [],
          workflow: {
            activities: [activityB, activityC, joinActivity],
          },
        },
        workflowVersion: 1,
        edges: [
          { id: 'B-J', source: 'B', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
          { id: 'C-J', source: 'C', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
        ],
      })

      useWorkflowStore.getState().syncJoinBranches()

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities || []

      // Should create parallel container
      const parallel = activities.find((a) => a.id === 'parallel_for_J') as Extract<Activity, { type: 'parallel' }>
      expect(parallel).toBeDefined()
      expect(parallel.type).toBe('parallel')
      expect(parallel.branches).toHaveLength(2)
      expect(parallel.branches?.map((b) => b.id)).toContain('B')
      expect(parallel.branches?.map((b) => b.id)).toContain('C')

      // Join should reference the parallel container
      const join = activities.find((a) => a.id === 'J') as Extract<Activity, { type: 'join' }>
      expect(join.join.branches).toEqual(['parallel_for_J'])

      // Source activities should not be in main array anymore
      expect(activities.find((a) => a.id === 'B')).toBeUndefined()
      expect(activities.find((a) => a.id === 'C')).toBeUndefined()
    })

    it('creates parallel container for three branches', () => {
      const activityB = createScriptActivity('B', 'Task B', 'python', 'print("B")')
      const activityC = createScriptActivity('C', 'Task C', 'python', 'print("C")')
      const activityD = createScriptActivity('D', 'Task D', 'python', 'print("D")')
      const joinActivity = createJoinActivity('J', 'Join J', 'all')

      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test',
          triggers: [],
          workflow: {
            activities: [activityB, activityC, activityD, joinActivity],
          },
        },
        workflowVersion: 1,
        edges: [
          { id: 'B-J', source: 'B', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
          { id: 'C-J', source: 'C', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
          { id: 'D-J', source: 'D', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
        ],
      })

      useWorkflowStore.getState().syncJoinBranches()

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities || []
      const parallel = activities.find((a) => a.id === 'parallel_for_J') as Extract<Activity, { type: 'parallel' }>

      expect(parallel.branches).toHaveLength(3)
      expect(parallel.branches?.map((b) => b.id).sort()).toEqual(['B', 'C', 'D'])
    })

    it('updates existing parallel container when branches change', () => {
      const activityB = createScriptActivity('B', 'Task B', 'python', 'print("B")')
      const activityC = createScriptActivity('C', 'Task C', 'python', 'print("C")')
      const activityD = createScriptActivity('D', 'Task D', 'python', 'print("D")')
      const joinActivity = createJoinActivity('J', 'Join J', 'all')

      // Start with B and C
      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test',
          triggers: [],
          workflow: {
            activities: [activityB, activityC, joinActivity],
          },
        },
        workflowVersion: 1,
        edges: [
          { id: 'B-J', source: 'B', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
          { id: 'C-J', source: 'C', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
        ],
      })

      useWorkflowStore.getState().syncJoinBranches()

      // Add D to activities and edges
      useWorkflowStore.setState({
        currentWorkflow: {
          ...useWorkflowStore.getState().currentWorkflow!,
          workflow: {
            activities: [...(useWorkflowStore.getState().currentWorkflow?.workflow.activities || []), activityD],
          },
        },
        edges: [
          { id: 'B-J', source: 'B', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
          { id: 'C-J', source: 'C', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
          { id: 'D-J', source: 'D', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
        ],
      })

      useWorkflowStore.getState().syncJoinBranches()

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities || []
      const parallel = activities.find((a) => a.id === 'parallel_for_J') as Extract<Activity, { type: 'parallel' }>

      expect(parallel.branches).toHaveLength(3)
      expect(parallel.branches?.map((b) => b.id).sort()).toEqual(['B', 'C', 'D'])
    })

    it('restores orphaned activities when edge is removed', () => {
      const activityB = createScriptActivity('B', 'Task B', 'python', 'print("B")')
      const activityC = createScriptActivity('C', 'Task C', 'python', 'print("C")')
      const activityD = createScriptActivity('D', 'Task D', 'python', 'print("D")')
      const joinActivity = createJoinActivity('J', 'Join J', 'all')

      // Start with B, C, D
      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test',
          triggers: [],
          workflow: {
            activities: [activityB, activityC, activityD, joinActivity],
          },
        },
        workflowVersion: 1,
        edges: [
          { id: 'B-J', source: 'B', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
          { id: 'C-J', source: 'C', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
          { id: 'D-J', source: 'D', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
        ],
      })

      useWorkflowStore.getState().syncJoinBranches()

      // Remove edge from C to J (now only B and D connect to J)
      useWorkflowStore.setState({
        edges: [
          { id: 'B-J', source: 'B', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
          { id: 'D-J', source: 'D', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
        ],
      })

      useWorkflowStore.getState().syncJoinBranches()

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities || []

      // Parallel should have only B and D
      const parallel = activities.find((a) => a.id === 'parallel_for_J') as Extract<Activity, { type: 'parallel' }>
      expect(parallel.branches?.map((b) => b.id).sort()).toEqual(['B', 'D'])

      // C should be restored to main activities array
      expect(activities.find((a) => a.id === 'C')).toBeDefined()
    })
  })

  describe('Join with single incoming edge', () => {
    it('removes parallel container and references activity directly', () => {
      const activityB = createScriptActivity('B', 'Task B', 'python', 'print("B")')
      const joinActivity = createJoinActivity('J', 'Join J', 'all')

      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test',
          triggers: [],
          workflow: {
            activities: [activityB, joinActivity],
          },
        },
        workflowVersion: 1,
        edges: [{ id: 'B-J', source: 'B', target: 'J', sourceHandle: 'source', targetHandle: 'target' }],
      })

      useWorkflowStore.getState().syncJoinBranches()

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities || []

      // Should NOT create parallel container
      expect(activities.find((a) => a.id === 'parallel_for_J')).toBeUndefined()

      // Join should reference B directly
      const join = activities.find((a) => a.id === 'J') as Extract<Activity, { type: 'join' }>
      expect(join.join.branches).toEqual(['B'])

      // B should still be in main activities
      expect(activities.find((a) => a.id === 'B')).toBeDefined()
    })

    it('removes existing parallel when going from 2 to 1 branch', () => {
      const activityB = createScriptActivity('B', 'Task B', 'python', 'print("B")')
      const activityC = createScriptActivity('C', 'Task C', 'python', 'print("C")')
      const joinActivity = createJoinActivity('J', 'Join J', 'all')

      // Start with 2 branches
      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test',
          triggers: [],
          workflow: {
            activities: [activityB, activityC, joinActivity],
          },
        },
        workflowVersion: 1,
        edges: [
          { id: 'B-J', source: 'B', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
          { id: 'C-J', source: 'C', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
        ],
      })

      useWorkflowStore.getState().syncJoinBranches()

      // Verify parallel exists
      let activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities || []
      expect(activities.find((a) => a.id === 'parallel_for_J')).toBeDefined()

      // Remove one edge
      useWorkflowStore.setState({
        edges: [{ id: 'B-J', source: 'B', target: 'J', sourceHandle: 'source', targetHandle: 'target' }],
      })

      useWorkflowStore.getState().syncJoinBranches()

      activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities || []

      // Parallel should be removed
      expect(activities.find((a) => a.id === 'parallel_for_J')).toBeUndefined()

      // Both B and C should be in main activities
      expect(activities.find((a) => a.id === 'B')).toBeDefined()
      expect(activities.find((a) => a.id === 'C')).toBeDefined()

      // Join should reference only B
      const join = activities.find((a) => a.id === 'J') as Extract<Activity, { type: 'join' }>
      expect(join.join.branches).toEqual(['B'])
    })
  })

  describe('Join with no incoming edges', () => {
    it('clears join branches and removes parallel if exists', () => {
      const activityB = createScriptActivity('B', 'Task B', 'python', 'print("B")')
      const activityC = createScriptActivity('C', 'Task C', 'python', 'print("C")')
      const joinActivity = createJoinActivity('J', 'Join J', 'all')

      // Start with 2 branches
      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test',
          triggers: [],
          workflow: {
            activities: [activityB, activityC, joinActivity],
          },
        },
        workflowVersion: 1,
        edges: [
          { id: 'B-J', source: 'B', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
          { id: 'C-J', source: 'C', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
        ],
      })

      useWorkflowStore.getState().syncJoinBranches()

      // Remove all edges
      useWorkflowStore.setState({ edges: [] })
      useWorkflowStore.getState().syncJoinBranches()

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities || []

      // Parallel should be removed
      expect(activities.find((a) => a.id === 'parallel_for_J')).toBeUndefined()

      // Join branches should be empty
      const join = activities.find((a) => a.id === 'J') as Extract<Activity, { type: 'join' }>
      expect(join.join.branches).toEqual([])

      // B and C should be restored to main activities
      expect(activities.find((a) => a.id === 'B')).toBeDefined()
      expect(activities.find((a) => a.id === 'C')).toBeDefined()
    })
  })

  describe('Multiple joins', () => {
    it('handles multiple independent joins', () => {
      const activityB = createScriptActivity('B', 'Task B', 'python', 'print("B")')
      const activityC = createScriptActivity('C', 'Task C', 'python', 'print("C")')
      const activityD = createScriptActivity('D', 'Task D', 'python', 'print("D")')
      const activityE = createScriptActivity('E', 'Task E', 'python', 'print("E")')
      const joinJ1 = createJoinActivity('J1', 'Join 1', 'all')
      const joinJ2 = createJoinActivity('J2', 'Join 2', 'all')

      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test',
          triggers: [],
          workflow: {
            activities: [activityB, activityC, activityD, activityE, joinJ1, joinJ2],
          },
        },
        workflowVersion: 1,
        edges: [
          { id: 'B-J1', source: 'B', target: 'J1', sourceHandle: 'source', targetHandle: 'target' },
          { id: 'C-J1', source: 'C', target: 'J1', sourceHandle: 'source', targetHandle: 'target' },
          { id: 'D-J2', source: 'D', target: 'J2', sourceHandle: 'source', targetHandle: 'target' },
          { id: 'E-J2', source: 'E', target: 'J2', sourceHandle: 'source', targetHandle: 'target' },
        ],
      })

      useWorkflowStore.getState().syncJoinBranches()

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities || []

      // Should have two parallel containers
      const parallel1 = activities.find((a) => a.id === 'parallel_for_J1') as Extract<Activity, { type: 'parallel' }>
      const parallel2 = activities.find((a) => a.id === 'parallel_for_J2') as Extract<Activity, { type: 'parallel' }>

      expect(parallel1).toBeDefined()
      expect(parallel2).toBeDefined()

      expect(parallel1.branches?.map((b) => b.id).sort()).toEqual(['B', 'C'])
      expect(parallel2.branches?.map((b) => b.id).sort()).toEqual(['D', 'E'])

      // Joins should reference their respective parallels
      const join1 = activities.find((a) => a.id === 'J1') as Extract<Activity, { type: 'join' }>
      const join2 = activities.find((a) => a.id === 'J2') as Extract<Activity, { type: 'join' }>

      expect(join1.join.branches).toEqual(['parallel_for_J1'])
      expect(join2.join.branches).toEqual(['parallel_for_J2'])
    })
  })

  describe('Edge cases', () => {
    it('does nothing when no workflow is set', () => {
      useWorkflowStore.setState({ currentWorkflow: null })

      expect(() => useWorkflowStore.getState().syncJoinBranches()).not.toThrow()
      expect(useWorkflowStore.getState().currentWorkflow).toBeNull()
    })

    it('handles workflow with no joins', () => {
      const activityA = createScriptActivity('A', 'Task A', 'python', 'print("A")')
      const activityB = createScriptActivity('B', 'Task B', 'python', 'print("B")')

      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test',
          triggers: [],
          workflow: {
            activities: [activityA, activityB],
          },
        },
        workflowVersion: 1,
        edges: [{ id: 'A-B', source: 'A', target: 'B', sourceHandle: 'source', targetHandle: 'target' }],
      })

      useWorkflowStore.getState().syncJoinBranches()

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities || []
      expect(activities).toHaveLength(2)
      expect(activities.map((a) => a.id)).toEqual(['A', 'B'])
    })
  })
})
