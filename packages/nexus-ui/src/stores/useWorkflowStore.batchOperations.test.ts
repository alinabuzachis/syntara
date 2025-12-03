import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { describe, expect, it, beforeEach } from 'vitest'

import type { EdgeConnection } from '../routes/builder/types/edge'

import { useWorkflowStore, createScriptActivity, createJoinActivity, createManualTrigger } from './useWorkflowStore'

type Activity = WorkflowAPI.components['schemas']['activity']

describe('useWorkflowStore - batchRemoveNodesAndEdges', () => {
  beforeEach(() => {
    useWorkflowStore.setState({
      currentWorkflow: null,
      workflowVersion: 0,
      edges: [],
    })
  })

  describe('Atomic operations', () => {
    it('removes activities and updates edges in single transaction', () => {
      const activityA = createScriptActivity('A', 'Task A', 'python', 'print("A")')
      const activityB = createScriptActivity('B', 'Task B', 'python', 'print("B")')
      const activityC = createScriptActivity('C', 'Task C', 'python', 'print("C")')

      const edges: EdgeConnection[] = [
        { id: 'A-B', source: 'A', target: 'B', sourceHandle: 'source', targetHandle: 'target' },
        { id: 'B-C', source: 'B', target: 'C', sourceHandle: 'source', targetHandle: 'target' },
      ]

      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test',
          triggers: [],
          workflow: {
            activities: [activityA, activityB, activityC],
          },
        },
        workflowVersion: 1,
        edges,
      })

      // Remove B and update edges
      const newEdges: EdgeConnection[] = [
        { id: 'A-C', source: 'A', target: 'C', sourceHandle: 'source', targetHandle: 'target' },
      ]

      useWorkflowStore.getState().batchRemoveNodesAndEdges({
        nodeIds: ['B'],
        edges: newEdges,
      })

      const state = useWorkflowStore.getState()
      const activities = state.currentWorkflow?.workflow.activities || []

      // B should be removed
      expect(activities).toHaveLength(2)
      expect(activities.map((a) => a.id)).toEqual(['A', 'C'])

      // Edges should be updated
      expect(state.edges).toEqual(newEdges)
    })

    it('removes multiple activities at once', () => {
      const activityA = createScriptActivity('A', 'Task A', 'python', 'print("A")')
      const activityB = createScriptActivity('B', 'Task B', 'python', 'print("B")')
      const activityC = createScriptActivity('C', 'Task C', 'python', 'print("C")')
      const activityD = createScriptActivity('D', 'Task D', 'python', 'print("D")')

      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test',
          triggers: [],
          workflow: {
            activities: [activityA, activityB, activityC, activityD],
          },
        },
        workflowVersion: 1,
        edges: [],
      })

      useWorkflowStore.getState().batchRemoveNodesAndEdges({
        nodeIds: ['B', 'C'],
        edges: [],
      })

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities || []
      expect(activities).toHaveLength(2)
      expect(activities.map((a) => a.id)).toEqual(['A', 'D'])
    })
  })

  describe('Join node cleanup', () => {
    it('removes join and cleans up parallel container', () => {
      const activityB = createScriptActivity('B', 'Task B', 'python', 'print("B")')
      const activityC = createScriptActivity('C', 'Task C', 'python', 'print("C")')
      const parallelActivity: Activity = {
        type: 'parallel',
        id: 'parallel_for_J',
        name: 'Parallel for J',
        branches: [activityB, activityC],
      }
      const joinActivity = createJoinActivity('J', 'Join J', 'all')

      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test',
          triggers: [],
          workflow: {
            activities: [parallelActivity, joinActivity],
          },
        },
        workflowVersion: 1,
        edges: [
          { id: 'B-J', source: 'B', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
          { id: 'C-J', source: 'C', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
        ],
      })

      useWorkflowStore.getState().batchRemoveNodesAndEdges({
        nodeIds: ['J'],
        edges: [],
      })

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities || []

      // Join should be removed
      expect(activities.find((a) => a.id === 'J')).toBeUndefined()

      // Parallel container should be removed
      expect(activities.find((a) => a.id === 'parallel_for_J')).toBeUndefined()

      // Branch activities should be restored
      expect(activities.find((a) => a.id === 'B')).toBeDefined()
      expect(activities.find((a) => a.id === 'C')).toBeDefined()
    })

    it('handles multiple join removals', () => {
      const activityB = createScriptActivity('B', 'Task B', 'python', 'print("B")')
      const activityC = createScriptActivity('C', 'Task C', 'python', 'print("C")')
      const activityD = createScriptActivity('D', 'Task D', 'python', 'print("D")')
      const activityE = createScriptActivity('E', 'Task E', 'python', 'print("E")')

      const parallel1: Activity = {
        type: 'parallel',
        id: 'parallel_for_J1',
        name: 'Parallel for J1',
        branches: [activityB, activityC],
      }
      const parallel2: Activity = {
        type: 'parallel',
        id: 'parallel_for_J2',
        name: 'Parallel for J2',
        branches: [activityD, activityE],
      }

      const joinJ1 = createJoinActivity('J1', 'Join 1', 'all')
      const joinJ2 = createJoinActivity('J2', 'Join 2', 'all')

      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test',
          triggers: [],
          workflow: {
            activities: [parallel1, joinJ1, parallel2, joinJ2],
          },
        },
        workflowVersion: 1,
        edges: [],
      })

      useWorkflowStore.getState().batchRemoveNodesAndEdges({
        nodeIds: ['J1', 'J2'],
        edges: [],
      })

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities || []

      // All joins and parallels should be removed
      expect(activities.find((a) => a.id === 'J1')).toBeUndefined()
      expect(activities.find((a) => a.id === 'J2')).toBeUndefined()
      expect(activities.find((a) => a.id === 'parallel_for_J1')).toBeUndefined()
      expect(activities.find((a) => a.id === 'parallel_for_J2')).toBeUndefined()

      // All branch activities should be restored
      expect(activities.map((a) => a.id).sort()).toEqual(['B', 'C', 'D', 'E'])
    })
  })

  describe('Trigger removal', () => {
    it('removes triggers by index', () => {
      const trigger1 = createManualTrigger(false)
      const trigger2 = createManualTrigger(true)
      const trigger3 = createManualTrigger(false)

      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test',
          triggers: [trigger1, trigger2, trigger3],
          workflow: {
            activities: [],
          },
        },
        workflowVersion: 1,
        edges: [],
      })

      useWorkflowStore.getState().batchRemoveNodesAndEdges({
        nodeIds: [],
        edges: [],
        triggerIndices: [1], // Remove second trigger
      })

      const triggers = useWorkflowStore.getState().currentWorkflow?.triggers || []
      expect(triggers).toHaveLength(2)
      expect(triggers).toEqual([trigger1, trigger3])
    })

    it('removes multiple triggers', () => {
      const trigger1 = createManualTrigger(false)
      const trigger2 = createManualTrigger(true)
      const trigger3 = createManualTrigger(false)

      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test',
          triggers: [trigger1, trigger2, trigger3],
          workflow: {
            activities: [],
          },
        },
        workflowVersion: 1,
        edges: [],
      })

      useWorkflowStore.getState().batchRemoveNodesAndEdges({
        nodeIds: [],
        edges: [],
        triggerIndices: [0, 2], // Remove first and third
      })

      const triggers = useWorkflowStore.getState().currentWorkflow?.triggers || []
      expect(triggers).toHaveLength(1)
      expect(triggers).toEqual([trigger2])
    })

    it('removes all triggers', () => {
      const trigger1 = createManualTrigger(false)
      const trigger2 = createManualTrigger(true)

      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test',
          triggers: [trigger1, trigger2],
          workflow: {
            activities: [],
          },
        },
        workflowVersion: 1,
        edges: [],
      })

      useWorkflowStore.getState().batchRemoveNodesAndEdges({
        nodeIds: [],
        edges: [],
        triggerIndices: [0, 1],
      })

      const triggers = useWorkflowStore.getState().currentWorkflow?.triggers
      expect(triggers).toBeUndefined()
    })
  })

  describe('Combined operations', () => {
    it('removes both activities and triggers atomically', () => {
      const trigger1 = createManualTrigger(false)
      const trigger2 = createManualTrigger(true)
      const activityA = createScriptActivity('A', 'Task A', 'python', 'print("A")')
      const activityB = createScriptActivity('B', 'Task B', 'python', 'print("B")')

      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test',
          triggers: [trigger1, trigger2],
          workflow: {
            activities: [activityA, activityB],
          },
        },
        workflowVersion: 1,
        edges: [{ id: 'A-B', source: 'A', target: 'B', sourceHandle: 'source', targetHandle: 'target' }],
      })

      useWorkflowStore.getState().batchRemoveNodesAndEdges({
        nodeIds: ['A'],
        edges: [],
        triggerIndices: [0],
      })

      const state = useWorkflowStore.getState()
      const activities = state.currentWorkflow?.workflow.activities || []
      const triggers = state.currentWorkflow?.triggers || []

      expect(activities).toHaveLength(1)
      expect(activities[0].id).toBe('B')

      expect(triggers).toHaveLength(1)
      expect(triggers[0]).toEqual(trigger2)

      expect(state.edges).toEqual([])
    })

    it('handles complex scenario with joins, triggers, and edges', () => {
      const trigger = createManualTrigger(false)
      const activityA = createScriptActivity('A', 'Task A', 'python', 'print("A")')
      const activityB = createScriptActivity('B', 'Task B', 'python', 'print("B")')
      const activityC = createScriptActivity('C', 'Task C', 'python', 'print("C")')

      const parallel: Activity = {
        type: 'parallel',
        id: 'parallel_for_J',
        name: 'Parallel for J',
        branches: [activityB, activityC],
      }
      const joinActivity = createJoinActivity('J', 'Join J', 'all')

      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test',
          triggers: [trigger],
          workflow: {
            activities: [activityA, parallel, joinActivity],
          },
        },
        workflowVersion: 1,
        edges: [
          { id: 'A-B', source: 'A', target: 'B', sourceHandle: 'source', targetHandle: 'target' },
          { id: 'A-C', source: 'A', target: 'C', sourceHandle: 'source', targetHandle: 'target' },
          { id: 'B-J', source: 'B', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
          { id: 'C-J', source: 'C', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
        ],
      })

      // Remove join, A, and trigger all at once
      useWorkflowStore.getState().batchRemoveNodesAndEdges({
        nodeIds: ['J', 'A'],
        edges: [],
        triggerIndices: [0],
      })

      const state = useWorkflowStore.getState()
      const activities = state.currentWorkflow?.workflow.activities || []

      // Should have B and C (restored from parallel), no A, no J, no parallel
      expect(activities.map((a) => a.id).sort()).toEqual(['B', 'C'])
      expect(state.currentWorkflow?.triggers).toBeUndefined()
      expect(state.edges).toEqual([])
    })
  })

  describe('Nested activity removal', () => {
    it('removes activity from condition then branch', () => {
      const activityB = createScriptActivity('B', 'Task B', 'python', 'print("B")')
      const activityC = createScriptActivity('C', 'Task C', 'python', 'print("C")')

      const condition: Extract<Activity, { type: 'condition' }> = {
        type: 'condition',
        id: 'A',
        name: 'Condition A',
        condition: 'input.value > 10',
        then: [activityB],
        else: [activityC],
      }

      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test',
          triggers: [],
          workflow: {
            activities: [condition],
          },
        },
        workflowVersion: 1,
        edges: [],
      })

      useWorkflowStore.getState().batchRemoveNodesAndEdges({
        nodeIds: ['B'],
        edges: [],
      })

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities || []
      const updatedCondition = activities[0] as Extract<Activity, { type: 'condition' }>

      expect(updatedCondition.then).toHaveLength(0)
      expect(updatedCondition.else).toHaveLength(1)
      expect(updatedCondition.else![0].id).toBe('C')
    })

    it('removes entire condition with nested activities', () => {
      const activityB = createScriptActivity('B', 'Task B', 'python', 'print("B")')

      const condition: Extract<Activity, { type: 'condition' }> = {
        type: 'condition',
        id: 'A',
        name: 'Condition A',
        condition: 'input.value > 10',
        then: [activityB],
        else: [],
      }

      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test',
          triggers: [],
          workflow: {
            activities: [condition],
          },
        },
        workflowVersion: 1,
        edges: [],
      })

      useWorkflowStore.getState().batchRemoveNodesAndEdges({
        nodeIds: ['A'],
        edges: [],
      })

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities || []
      expect(activities).toHaveLength(0)
    })
  })

  describe('Edge cases', () => {
    it('does nothing when no workflow is set', () => {
      useWorkflowStore.setState({ currentWorkflow: null })

      expect(() =>
        useWorkflowStore.getState().batchRemoveNodesAndEdges({
          nodeIds: ['A'],
          edges: [],
        })
      ).not.toThrow()

      expect(useWorkflowStore.getState().currentWorkflow).toBeNull()
    })

    it('handles empty nodeIds array', () => {
      const activityA = createScriptActivity('A', 'Task A', 'python', 'print("A")')

      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test',
          triggers: [],
          workflow: {
            activities: [activityA],
          },
        },
        workflowVersion: 1,
        edges: [],
      })

      useWorkflowStore.getState().batchRemoveNodesAndEdges({
        nodeIds: [],
        edges: [],
      })

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities || []
      expect(activities).toHaveLength(1)
      expect(activities[0].id).toBe('A')
    })

    it('handles non-existent node IDs gracefully', () => {
      const activityA = createScriptActivity('A', 'Task A', 'python', 'print("A")')

      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test',
          triggers: [],
          workflow: {
            activities: [activityA],
          },
        },
        workflowVersion: 1,
        edges: [],
      })

      useWorkflowStore.getState().batchRemoveNodesAndEdges({
        nodeIds: ['NON_EXISTENT'],
        edges: [],
      })

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities || []
      expect(activities).toHaveLength(1)
      expect(activities[0].id).toBe('A')
    })

    it('handles invalid trigger indices', () => {
      const trigger = createManualTrigger(false)

      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test',
          triggers: [trigger],
          workflow: {
            activities: [],
          },
        },
        workflowVersion: 1,
        edges: [],
      })

      useWorkflowStore.getState().batchRemoveNodesAndEdges({
        nodeIds: [],
        edges: [],
        triggerIndices: [99], // Out of bounds
      })

      const triggers = useWorkflowStore.getState().currentWorkflow?.triggers || []
      expect(triggers).toHaveLength(1)
    })
  })

  describe('State consistency', () => {
    it('maintains workflow structure integrity', () => {
      const activityA = createScriptActivity('A', 'Task A', 'python', 'print("A")')
      const activityB = createScriptActivity('B', 'Task B', 'python', 'print("B")')

      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test Workflow',
          triggers: [],
          workflow: {
            activities: [activityA, activityB],
          },
        },
        workflowVersion: 1,
        edges: [{ id: 'A-B', source: 'A', target: 'B', sourceHandle: 'source', targetHandle: 'target' }],
      })

      useWorkflowStore.getState().batchRemoveNodesAndEdges({
        nodeIds: ['B'],
        edges: [],
      })

      const workflow = useWorkflowStore.getState().currentWorkflow

      // Workflow structure should be intact
      expect(workflow).toBeDefined()
      expect(workflow?.name).toBe('Test Workflow')
      expect(workflow?.workflow).toBeDefined()
      expect(workflow?.workflow.activities).toBeDefined()
    })
  })
})
