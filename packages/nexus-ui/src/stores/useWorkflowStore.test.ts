import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { describe, expect, it, beforeEach } from 'vitest'

import type { EdgeConnection } from '../routes/builder/types/edge'

import {
  useWorkflowStore,
  createManualTrigger,
  createConvergeActivity,
  createScriptActivity,
  createGenericActivity,
} from './useWorkflowStore'

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
        schemaVersion: '1.0',
        version: 1,
        metadata: { name: 'Test Workflow', description: '' },
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
        schemaVersion: '1.0',
        version: 1,
        metadata: { name: 'Test Workflow', description: '' },
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
        schemaVersion: '1.0',
        version: 1,
        metadata: { name: 'Test Workflow', description: '' },
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
        schemaVersion: '1.0',
        version: 1,
        metadata: { name: 'Test Workflow', description: '' },
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
        schemaVersion: '1.0',
        version: 1,
        metadata: { name: 'Test Workflow', description: '' },
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
            schemaVersion: '1.0',
            version: 1,
            metadata: { name: 'Test', description: '' },
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
        const activities = state.currentWorkflow?.workflow.activities ?? []

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
            schemaVersion: '1.0',
            version: 1,
            metadata: { name: 'Test', description: '' },
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
            schemaVersion: '1.0',
            version: 1,
            metadata: { name: 'Test', description: '' },
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
          schemaVersion: '1.0',
          version: 1,
          metadata: { name: 'Test', description: '' },
          triggers: [],
          workflow: {
            activities: [activity1, activity2, activity3],
          },
        },
        workflowVersion: 1,
        edges: [],
      })

      useWorkflowStore.getState().moveActivityBefore('C', 'A')

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities ?? []
      expect(activities.map((a) => a.id)).toEqual(['C', 'A', 'B'])
    })

    it('does nothing if activity is already before target', () => {
      const activity1 = createScriptActivity('A', 'Task A', 'python', 'print("A")')
      const activity2 = createScriptActivity('B', 'Task B', 'python', 'print("B")')

      useWorkflowStore.setState({
        currentWorkflow: {
          schemaVersion: '1.0',
          version: 1,
          metadata: { name: 'Test', description: '' },
          triggers: [],
          workflow: {
            activities: [activity1, activity2],
          },
        },
        workflowVersion: 1,
        edges: [],
      })

      useWorkflowStore.getState().moveActivityBefore('A', 'B')

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities ?? []
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
          schemaVersion: '1.0',
          version: 1,
          metadata: { name: 'Test', description: '' },
          triggers: [],
          workflow: {
            activities: [activity1, activity2, activity3],
          },
        },
        workflowVersion: 1,
        edges: [],
      })

      useWorkflowStore.getState().moveActivityAfter('A', 'C')

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities ?? []
      expect(activities.map((a) => a.id)).toEqual(['B', 'C', 'A'])
    })

    it('does nothing if activity is already after target', () => {
      const activity1 = createScriptActivity('A', 'Task A', 'python', 'print("A")')
      const activity2 = createScriptActivity('B', 'Task B', 'python', 'print("B")')

      useWorkflowStore.setState({
        currentWorkflow: {
          schemaVersion: '1.0',
          version: 1,
          metadata: { name: 'Test', description: '' },
          triggers: [],
          workflow: {
            activities: [activity1, activity2],
          },
        },
        workflowVersion: 1,
        edges: [],
      })

      useWorkflowStore.getState().moveActivityAfter('B', 'A')

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities ?? []
      expect(activities.map((a) => a.id)).toEqual(['A', 'B'])
    })
  })

  describe('createGenericActivity', () => {
    it('creates a minimal generic placeholder node', () => {
      const activity = createGenericActivity('generic-1', 'Placeholder')

      expect(activity).toMatchObject({
        type: 'task',
        id: 'generic-1',
        name: 'Placeholder',
        task: {
          config: {},
        },
      })
      expect((activity as Record<string, unknown>).metadata).toMatchObject({
        __isGeneric: true,
      })
    })

    it('creates generic node without executor details', () => {
      const activity = createGenericActivity('generic-1', 'Test')

      // Should not have executor property
      expect(activity.task).not.toHaveProperty('executor')
      // Config should be empty
      expect(activity.task.config).toEqual({})
    })

    it('uses default name when not provided', () => {
      const activity = createGenericActivity('generic-1')

      expect(activity.name).toBe('New Node')
    })

    it('includes custom message in metadata when provided', () => {
      const activity = createGenericActivity('generic-1', 'Test', 'Custom message here')

      expect((activity as Record<string, unknown>).metadata).toMatchObject({
        __isGeneric: true,
        __customMessage: 'Custom message here',
      })
    })

    it('does not include custom message when not provided', () => {
      const activity = createGenericActivity('generic-1', 'Test')

      expect((activity as Record<string, unknown>).metadata).toEqual({
        __isGeneric: true,
      })
    })

    it('always sets __isGeneric to true', () => {
      const activity = createGenericActivity('generic-1', 'Test')

      expect((activity as Record<string, unknown>).metadata as Record<string, unknown>).toHaveProperty(
        '__isGeneric',
        true
      )
    })
  })

  describe('duplicateActivity', () => {
    const baseWorkflow: WorkflowDefinition = {
      schemaVersion: '1.0',
      version: 1,
      metadata: { name: 'Test', description: '' },
      triggers: [],
      workflow: { activities: [] },
    }

    beforeEach(() => {
      useWorkflowStore.getState().setWorkflow(baseWorkflow)
    })

    it('returns null when the workflow is not loaded', () => {
      useWorkflowStore.setState({ currentWorkflow: null })
      const result = useWorkflowStore.getState().duplicateActivity('nonexistent')
      expect(result).toBeNull()
    })

    it('returns null when the activity is not found', () => {
      const result = useWorkflowStore.getState().duplicateActivity('nonexistent')
      expect(result).toBeNull()
    })

    it('appends a clone with a new ID and marks dirty', () => {
      const original = createScriptActivity('act-1', 'Script', 'python', 'print(1)')
      useWorkflowStore.getState().addActivity(original)

      const newId = useWorkflowStore.getState().duplicateActivity('act-1')

      expect(newId).not.toBeNull()
      expect(newId).not.toBe('act-1')

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities ?? []
      expect(activities).toHaveLength(2)
      expect(activities[1].id).toBe(newId)
      expect(useWorkflowStore.getState().isDirty).toBe(true)
    })

    it('names the clone "Copy of <original name>"', () => {
      const original = createScriptActivity('act-1', 'My Script', 'python', 'print(1)')
      useWorkflowStore.getState().addActivity(original)

      useWorkflowStore.getState().duplicateActivity('act-1')

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities ?? []
      expect(activities[1].name).toBe('Copy of My Script')
    })

    it('generates a unique name when "Copy of…" already exists', () => {
      const original = createScriptActivity('act-1', 'Script', 'python', 'print(1)')
      const copy1 = createScriptActivity('act-2', 'Copy of Script', 'python', 'print(1)')
      useWorkflowStore.getState().addActivity(original)
      useWorkflowStore.getState().addActivity(copy1)

      useWorkflowStore.getState().duplicateActivity('act-1')

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities ?? []
      expect(activities[2].name).toBe('Copy of Script2')
    })

    it('preserves the original activity type and config', () => {
      const original = createScriptActivity('act-1', 'Script', 'python', 'print("hello")')
      useWorkflowStore.getState().addActivity(original)

      const newId = useWorkflowStore.getState().duplicateActivity('act-1')

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities ?? []
      const clone = activities.find((a) => a.id === newId)
      expect(clone?.type).toBe('task')
      const cloneTask = clone as Extract<Activity, { type: 'task' }>
      expect(cloneTask.task.config).toEqual(original.task.config)
    })

    it('does not share object references between original and clone', () => {
      const original = createScriptActivity('act-1', 'Script', 'python', 'print(1)')
      useWorkflowStore.getState().addActivity(original)

      const newId = useWorkflowStore.getState().duplicateActivity('act-1')

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities ?? []
      const clone = activities.find((a) => a.id === newId)
      expect(clone).not.toBe(original)
    })
  })

  describe('replaceActivity', () => {
    const baseWorkflow: WorkflowDefinition = {
      schemaVersion: '1.0',
      version: 1,
      metadata: { name: 'Test', description: '' },
      triggers: [],
      workflow: { activities: [] },
    }

    beforeEach(() => {
      useWorkflowStore.getState().setWorkflow(baseWorkflow)
    })

    it('replaces the activity in place and marks dirty', () => {
      const original = createScriptActivity('act-1', 'Script', 'python', 'print(1)')
      const replacement = createScriptActivity('tmp-id', 'REST API', 'python', 'print(2)')
      useWorkflowStore.getState().addActivity(original)

      useWorkflowStore.getState().replaceActivity('act-1', { ...replacement, id: 'act-1' })

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities ?? []
      expect(activities).toHaveLength(1)
      expect(activities[0].id).toBe('act-1')
      expect(activities[0].name).toBe('REST API')
      expect(useWorkflowStore.getState().isDirty).toBe(true)
    })

    it('does not carry over type-specific fields from the old activity', () => {
      const conditionActivity: Activity = {
        type: 'condition',
        id: 'cond-1',
        name: 'My Condition',
        condition: 'some.expr',
        then: [],
        else: [],
      }
      const scriptActivity = createScriptActivity('tmp-id', 'Script Node', 'python', 'print(1)')
      useWorkflowStore.getState().addActivity(conditionActivity)

      useWorkflowStore.getState().replaceActivity('cond-1', { ...scriptActivity, id: 'cond-1' })

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities ?? []
      const replaced = activities[0] as Record<string, unknown>
      expect(replaced.type).toBe('task')
      expect(replaced).not.toHaveProperty('condition')
      expect(replaced).not.toHaveProperty('then')
      expect(replaced).not.toHaveProperty('else')
    })

    it('preserves list order when replacing a non-first activity', () => {
      const act1 = createScriptActivity('act-1', 'First', 'python', '')
      const act2 = createScriptActivity('act-2', 'Second', 'python', '')
      const act3 = createScriptActivity('act-3', 'Third', 'python', '')
      useWorkflowStore.getState().addActivity(act1)
      useWorkflowStore.getState().addActivity(act2)
      useWorkflowStore.getState().addActivity(act3)

      const replacement = createScriptActivity('tmp', 'Replaced', 'python', '')
      useWorkflowStore.getState().replaceActivity('act-2', { ...replacement, id: 'act-2' })

      const ids = (useWorkflowStore.getState().currentWorkflow?.workflow.activities ?? []).map((a) => a.id)
      expect(ids).toEqual(['act-1', 'act-2', 'act-3'])
    })

    it('does nothing when the workflow is not loaded', () => {
      useWorkflowStore.setState({ currentWorkflow: null })
      const scriptActivity = createScriptActivity('tmp', 'Script', 'python', '')
      useWorkflowStore.getState().replaceActivity('any-id', scriptActivity)
      expect(useWorkflowStore.getState().currentWorkflow).toBeNull()
    })

    it('removes type-specific outgoing edges when replacing a condition node with a task node', () => {
      const conditionActivity: Activity = {
        type: 'condition',
        id: 'cond-1',
        name: 'My Condition',
        condition: 'some.expr',
        then: [],
        else: [],
      }
      useWorkflowStore.getState().addActivity(conditionActivity)
      useWorkflowStore.setState({
        edges: [
          { id: 'e-true', source: 'cond-1', target: 'node-a', sourceHandle: 'true', targetHandle: 'target' },
          { id: 'e-false', source: 'cond-1', target: 'node-b', sourceHandle: 'false', targetHandle: 'target' },
          { id: 'e-in', source: 'prev-node', target: 'cond-1', sourceHandle: 'source', targetHandle: 'target' },
        ] as EdgeConnection[],
      })

      const scriptActivity = createScriptActivity('tmp', 'Script Node', 'python', 'print(1)')
      useWorkflowStore.getState().replaceActivity('cond-1', { ...scriptActivity, id: 'cond-1' })

      const edges = useWorkflowStore.getState().edges
      expect(edges.map((e) => e.id)).toEqual(['e-in'])
    })

    it('removes approval-specific outgoing edges when replacing an approval node with a task node', () => {
      const approvalActivity = {
        type: 'approval',
        id: 'appr-1',
        name: 'My Approval',
        approval: { approvers: [], prompt: 'Please approve', onApproved: [], onRejected: [] },
      } as unknown as Activity
      useWorkflowStore.getState().addActivity(approvalActivity)
      useWorkflowStore.setState({
        edges: [
          { id: 'e-ok', source: 'appr-1', target: 'node-a', sourceHandle: 'approved', targetHandle: 'target' },
          { id: 'e-no', source: 'appr-1', target: 'node-b', sourceHandle: 'rejected', targetHandle: 'target' },
          { id: 'e-in', source: 'prev-node', target: 'appr-1', sourceHandle: 'source', targetHandle: 'target' },
        ] as EdgeConnection[],
      })

      const scriptActivity = createScriptActivity('tmp', 'Script Node', 'python', 'print(1)')
      useWorkflowStore.getState().replaceActivity('appr-1', { ...scriptActivity, id: 'appr-1' })

      const edges = useWorkflowStore.getState().edges
      expect(edges.map((e) => e.id)).toEqual(['e-in'])
    })

    it('removes loop-specific outgoing edges when replacing a loop node with a task node', () => {
      const loopActivity = {
        type: 'loop',
        id: 'loop-1',
        name: 'My Loop',
        loop: { type: 'forEach', items: '{{ items }}', do: [] },
      } as unknown as Activity
      useWorkflowStore.getState().addActivity(loopActivity)
      useWorkflowStore.setState({
        edges: [
          { id: 'e-loop', source: 'loop-1', target: 'node-a', sourceHandle: 'loop', targetHandle: 'target' },
          { id: 'e-done', source: 'loop-1', target: 'node-b', sourceHandle: 'done', targetHandle: 'target' },
          { id: 'e-in', source: 'prev-node', target: 'loop-1', sourceHandle: 'source', targetHandle: 'target' },
        ] as EdgeConnection[],
      })

      const scriptActivity = createScriptActivity('tmp', 'Script Node', 'python', 'print(1)')
      useWorkflowStore.getState().replaceActivity('loop-1', { ...scriptActivity, id: 'loop-1' })

      const edges = useWorkflowStore.getState().edges
      expect(edges.map((e) => e.id)).toEqual(['e-in'])
    })

    it('preserves all edges when replacing a node with the same type', () => {
      const act1 = createScriptActivity('act-1', 'Script', 'python', 'print(1)')
      useWorkflowStore.getState().addActivity(act1)
      useWorkflowStore.setState({
        edges: [
          { id: 'e-out', source: 'act-1', target: 'node-a', sourceHandle: 'source', targetHandle: 'target' },
          { id: 'e-in', source: 'prev-node', target: 'act-1', sourceHandle: 'source', targetHandle: 'target' },
        ] as EdgeConnection[],
      })

      const replacement = createScriptActivity('tmp', 'REST API', 'python', 'print(2)')
      useWorkflowStore.getState().replaceActivity('act-1', { ...replacement, id: 'act-1' })

      const edges = useWorkflowStore.getState().edges
      expect(edges.map((e) => e.id)).toEqual(['e-out', 'e-in'])
    })
  })
})
