import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { describe, expect, it, beforeEach } from 'vitest'

import type { EdgeConnection } from '../routes/builder/types/edge'

import { useWorkflowStore, createManualTrigger, createConvergeActivity, createScriptActivity } from './useWorkflowStore'

type Activity = WorkflowAPI.components['schemas']['activity']
type WorkflowDefinition = WorkflowAPI.components['schemas']['workflow-definition.schema']

describe('useWorkflowStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useWorkflowStore.setState({
      currentWorkflow: null,
      workflowVersion: 0,
      edges: [],
    })
  })

  describe('setWorkflow', () => {
    it('sets workflow and increments version', () => {
      const workflow: WorkflowDefinition = {
        name: 'Test Workflow',
        triggers: [],
        workflow: {
          activities: [],
        },
      }

      expect(useWorkflowStore.getState().workflowVersion).toBe(0)

      useWorkflowStore.getState().setWorkflow(workflow)

      const state = useWorkflowStore.getState()
      expect(state.currentWorkflow).toEqual(workflow)
      expect(state.workflowVersion).toBe(1)
    })

    it('increments version on each call', () => {
      const workflow: WorkflowDefinition = {
        name: 'Test Workflow',
        triggers: [],
        workflow: {
          activities: [],
        },
      }

      useWorkflowStore.getState().setWorkflow(workflow)
      expect(useWorkflowStore.getState().workflowVersion).toBe(1)

      useWorkflowStore.getState().setWorkflow(workflow)
      expect(useWorkflowStore.getState().workflowVersion).toBe(2)

      useWorkflowStore.getState().setWorkflow(workflow)
      expect(useWorkflowStore.getState().workflowVersion).toBe(3)
    })

    it('allows setting workflow to null', () => {
      const workflow: WorkflowDefinition = {
        name: 'Test Workflow',
        triggers: [],
        workflow: {
          activities: [],
        },
      }

      useWorkflowStore.getState().setWorkflow(workflow)
      expect(useWorkflowStore.getState().currentWorkflow).not.toBeNull()

      useWorkflowStore.getState().setWorkflow(null)
      expect(useWorkflowStore.getState().currentWorkflow).toBeNull()
      expect(useWorkflowStore.getState().workflowVersion).toBe(2)
    })
  })

  describe('setEdges', () => {
    it('sets edges', () => {
      const edges: EdgeConnection[] = [
        { id: 'A-B', source: 'A', target: 'B', sourceHandle: 'source', targetHandle: 'target' },
      ]

      useWorkflowStore.getState().setEdges(edges)

      expect(useWorkflowStore.getState().edges).toEqual(edges)
    })

    it('replaces existing edges', () => {
      const edges1: EdgeConnection[] = [
        { id: 'A-B', source: 'A', target: 'B', sourceHandle: 'source', targetHandle: 'target' },
      ]
      const edges2: EdgeConnection[] = [
        { id: 'C-D', source: 'C', target: 'D', sourceHandle: 'source', targetHandle: 'target' },
      ]

      useWorkflowStore.getState().setEdges(edges1)
      expect(useWorkflowStore.getState().edges).toEqual(edges1)

      useWorkflowStore.getState().setEdges(edges2)
      expect(useWorkflowStore.getState().edges).toEqual(edges2)
    })
  })

  describe('Trigger management', () => {
    beforeEach(() => {
      const workflow: WorkflowDefinition = {
        name: 'Test Workflow',
        triggers: [],
        workflow: {
          activities: [],
        },
      }
      useWorkflowStore.getState().setWorkflow(workflow)
    })

    describe('addTrigger', () => {
      it('adds trigger to empty array', () => {
        const trigger = createManualTrigger(false)

        useWorkflowStore.getState().addTrigger(trigger)

        const state = useWorkflowStore.getState()
        expect(state.currentWorkflow?.triggers).toHaveLength(1)
        expect(state.currentWorkflow?.triggers?.[0]).toEqual(trigger)
      })

      it('adds multiple triggers', () => {
        const trigger1 = createManualTrigger(false)
        const trigger2 = createManualTrigger(true)

        useWorkflowStore.getState().addTrigger(trigger1)
        useWorkflowStore.getState().addTrigger(trigger2)

        const state = useWorkflowStore.getState()
        expect(state.currentWorkflow?.triggers).toHaveLength(2)
        expect(state.currentWorkflow?.triggers).toEqual([trigger1, trigger2])
      })

      it('does nothing when no workflow is set', () => {
        useWorkflowStore.setState({ currentWorkflow: null })

        const trigger = createManualTrigger(false)
        useWorkflowStore.getState().addTrigger(trigger)

        expect(useWorkflowStore.getState().currentWorkflow).toBeNull()
      })
    })

    describe('removeTrigger', () => {
      it('removes trigger by index', () => {
        const trigger1 = createManualTrigger(false)
        const trigger2 = createManualTrigger(true)

        useWorkflowStore.getState().addTrigger(trigger1)
        useWorkflowStore.getState().addTrigger(trigger2)
        useWorkflowStore.getState().removeTrigger(0)

        const state = useWorkflowStore.getState()
        expect(state.currentWorkflow?.triggers).toHaveLength(1)
        expect(state.currentWorkflow?.triggers?.[0]).toEqual(trigger2)
      })

      it('does nothing when no triggers exist', () => {
        useWorkflowStore.getState().removeTrigger(0)

        expect(useWorkflowStore.getState().currentWorkflow?.triggers).toEqual([])
      })
    })

    describe('updateTrigger', () => {
      it('updates trigger at index', () => {
        const trigger1 = createManualTrigger(false)
        const trigger2 = createManualTrigger(true)

        useWorkflowStore.getState().addTrigger(trigger1)
        useWorkflowStore.getState().updateTrigger(0, trigger2)

        const state = useWorkflowStore.getState()
        expect(state.currentWorkflow?.triggers?.[0]).toEqual(trigger2)
      })
    })
  })

  describe('Activity management', () => {
    beforeEach(() => {
      const workflow: WorkflowDefinition = {
        name: 'Test Workflow',
        triggers: [],
        workflow: {
          activities: [],
        },
      }
      useWorkflowStore.getState().setWorkflow(workflow)
    })

    describe('addActivity', () => {
      it('adds activity to empty array', () => {
        const activity = createScriptActivity('A', 'Task A', 'python', 'print("A")')

        useWorkflowStore.getState().addActivity(activity)

        const state = useWorkflowStore.getState()
        expect(state.currentWorkflow?.workflow.activities).toHaveLength(1)
        expect(state.currentWorkflow?.workflow.activities[0]).toEqual(activity)
      })

      it('adds multiple activities', () => {
        const activity1 = createScriptActivity('A', 'Task A', 'python', 'print("A")')
        const activity2 = createScriptActivity('B', 'Task B', 'python', 'print("B")')

        useWorkflowStore.getState().addActivity(activity1)
        useWorkflowStore.getState().addActivity(activity2)

        const state = useWorkflowStore.getState()
        expect(state.currentWorkflow?.workflow.activities).toHaveLength(2)
        expect(state.currentWorkflow?.workflow.activities).toEqual([activity1, activity2])
      })
    })

    describe('removeActivity', () => {
      it('removes activity from flat list', () => {
        const activity1 = createScriptActivity('A', 'Task A', 'python', 'print("A")')
        const activity2 = createScriptActivity('B', 'Task B', 'python', 'print("B")')

        useWorkflowStore.getState().addActivity(activity1)
        useWorkflowStore.getState().addActivity(activity2)
        useWorkflowStore.getState().removeActivity('A')

        const state = useWorkflowStore.getState()
        expect(state.currentWorkflow?.workflow.activities).toHaveLength(1)
        expect(state.currentWorkflow?.workflow.activities[0].id).toBe('B')
      })

      it('removes join activity and cleans up parallel container', () => {
        const parallelActivity: Activity = {
          type: 'parallel',
          id: 'parallel_for_J',
          name: 'Parallel for J',
          branches: [
            createScriptActivity('B', 'Task B', 'python', 'print("B")'),
            createScriptActivity('C', 'Task C', 'python', 'print("C")'),
          ],
        }
        const convergeActivity = createConvergeActivity('J', 'Converge J')

        useWorkflowStore.setState({
          currentWorkflow: {
            name: 'Test',
            triggers: [],
            workflow: {
              activities: [parallelActivity, convergeActivity],
            },
          },
          workflowVersion: 1,
          edges: [],
        })

        useWorkflowStore.getState().removeActivity('J')

        const state = useWorkflowStore.getState()
        const activities = state.currentWorkflow?.workflow.activities || []

        // Parallel container should be removed
        expect(activities.find((a) => a.id === 'parallel_for_J')).toBeUndefined()
        // Join should be removed
        expect(activities.find((a) => a.id === 'J')).toBeUndefined()
        // Branch activities should be restored
        expect(activities.find((a) => a.id === 'B')).toBeDefined()
        expect(activities.find((a) => a.id === 'C')).toBeDefined()
      })

      it('removes activity from nested condition', () => {
        const condition: Extract<Activity, { type: 'condition' }> = {
          type: 'condition',
          id: 'A',
          name: 'Condition A',
          condition: 'input.value > 10',
          then: [createScriptActivity('B', 'Task B', 'python', 'print("B")')],
          else: [createScriptActivity('C', 'Task C', 'python', 'print("C")')],
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

        useWorkflowStore.getState().removeActivity('B')

        const state = useWorkflowStore.getState()
        const updatedCondition = state.currentWorkflow?.workflow.activities[0] as Extract<
          Activity,
          { type: 'condition' }
        >

        expect(updatedCondition.then).toHaveLength(0)
        expect(updatedCondition.else).toHaveLength(1)
      })
    })

    describe('updateActivity', () => {
      it('updates activity in flat list', () => {
        const activity = createScriptActivity('A', 'Task A', 'python', 'print("A")')

        useWorkflowStore.getState().addActivity(activity)
        useWorkflowStore.getState().updateActivity('A', { name: 'Updated Task A' })

        const state = useWorkflowStore.getState()
        expect(state.currentWorkflow?.workflow.activities[0].name).toBe('Updated Task A')
      })

      it('updates activity in nested condition', () => {
        const condition: Extract<Activity, { type: 'condition' }> = {
          type: 'condition',
          id: 'A',
          name: 'Condition A',
          condition: 'input.value > 10',
          then: [createScriptActivity('B', 'Task B', 'python', 'print("B")')],
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

        useWorkflowStore.getState().updateActivity('B', { name: 'Updated Task B' })

        const state = useWorkflowStore.getState()
        const updatedCondition = state.currentWorkflow?.workflow.activities[0] as Extract<
          Activity,
          { type: 'condition' }
        >

        expect(updatedCondition.then[0].name).toBe('Updated Task B')
      })
    })
  })

  describe('moveActivityBefore', () => {
    it('moves activity before target', () => {
      const activity1 = createScriptActivity('A', 'Task A', 'python', 'print("A")')
      const activity2 = createScriptActivity('B', 'Task B', 'python', 'print("B")')
      const activity3 = createScriptActivity('C', 'Task C', 'python', 'print("C")')

      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test',
          triggers: [],
          workflow: {
            activities: [activity1, activity2, activity3],
          },
        },
        workflowVersion: 1,
        edges: [],
      })

      useWorkflowStore.getState().moveActivityBefore('C', 'A')

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities || []
      expect(activities.map((a) => a.id)).toEqual(['C', 'A', 'B'])
    })

    it('does nothing if activity is already before target', () => {
      const activity1 = createScriptActivity('A', 'Task A', 'python', 'print("A")')
      const activity2 = createScriptActivity('B', 'Task B', 'python', 'print("B")')

      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test',
          triggers: [],
          workflow: {
            activities: [activity1, activity2],
          },
        },
        workflowVersion: 1,
        edges: [],
      })

      useWorkflowStore.getState().moveActivityBefore('A', 'B')

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities || []
      expect(activities.map((a) => a.id)).toEqual(['A', 'B'])
    })
  })

  describe('moveActivityAfter', () => {
    it('moves activity after target', () => {
      const activity1 = createScriptActivity('A', 'Task A', 'python', 'print("A")')
      const activity2 = createScriptActivity('B', 'Task B', 'python', 'print("B")')
      const activity3 = createScriptActivity('C', 'Task C', 'python', 'print("C")')

      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test',
          triggers: [],
          workflow: {
            activities: [activity1, activity2, activity3],
          },
        },
        workflowVersion: 1,
        edges: [],
      })

      useWorkflowStore.getState().moveActivityAfter('A', 'C')

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities || []
      expect(activities.map((a) => a.id)).toEqual(['B', 'C', 'A'])
    })

    it('does nothing if activity is already after target', () => {
      const activity1 = createScriptActivity('A', 'Task A', 'python', 'print("A")')
      const activity2 = createScriptActivity('B', 'Task B', 'python', 'print("B")')

      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test',
          triggers: [],
          workflow: {
            activities: [activity1, activity2],
          },
        },
        workflowVersion: 1,
        edges: [],
      })

      useWorkflowStore.getState().moveActivityAfter('B', 'A')

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities || []
      expect(activities.map((a) => a.id)).toEqual(['A', 'B'])
    })
  })
})
