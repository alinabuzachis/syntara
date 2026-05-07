import { describe, expect, it, beforeEach } from 'vitest'

import type { EdgeConnection } from '../routes/builder/types/edge'

import {
  useWorkflowStore,
  createManualTrigger,
  createConvergeActivity,
  createScriptActivity,
  createGenericActivity,
} from './useWorkflowStore'
import type { Activity, WorkflowDefinition } from './workflowStoreTypes'

// Helper to create a v2 WorkflowDefinition for tests
function makeWorkflow(name: string, activities: Activity[] = []): WorkflowDefinition {
  return {
    schema_version: '2.0.0',
    name,
    description: '',
    triggers: [],
    workflow: { activities },
  }
}

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
      const workflow = makeWorkflow('Test Workflow')

      expect(useWorkflowStore.getState().workflowVersion).toBe(0)

      useWorkflowStore.getState().setWorkflow(workflow)

      const state = useWorkflowStore.getState()
      expect(state.currentWorkflow).toEqual(workflow)
      expect(state.workflowVersion).toBe(1)
    })

    it('increments version on each call', () => {
      const workflow = makeWorkflow('Test Workflow')

      useWorkflowStore.getState().setWorkflow(workflow)
      expect(useWorkflowStore.getState().workflowVersion).toBe(1)

      useWorkflowStore.getState().setWorkflow(workflow)
      expect(useWorkflowStore.getState().workflowVersion).toBe(2)

      useWorkflowStore.getState().setWorkflow(workflow)
      expect(useWorkflowStore.getState().workflowVersion).toBe(3)
    })

    it('allows setting workflow to null', () => {
      const workflow = makeWorkflow('Test Workflow')

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
      useWorkflowStore.getState().setWorkflow(makeWorkflow('Test Workflow'))
    })

    describe('addTrigger', () => {
      it('adds trigger to empty array', () => {
        const trigger = createManualTrigger('test-trigger-1', false)

        useWorkflowStore.getState().addTrigger(trigger)

        const state = useWorkflowStore.getState()
        expect(state.currentWorkflow?.triggers).toHaveLength(1)
        expect(state.currentWorkflow?.triggers?.[0]).toEqual(trigger)
      })

      it('adds multiple triggers', () => {
        const trigger1 = createManualTrigger('test-trigger-1', false)
        const trigger2 = createManualTrigger('test-trigger-2', true)

        useWorkflowStore.getState().addTrigger(trigger1)
        useWorkflowStore.getState().addTrigger(trigger2)

        const state = useWorkflowStore.getState()
        expect(state.currentWorkflow?.triggers).toHaveLength(2)
        expect(state.currentWorkflow?.triggers).toEqual([trigger1, trigger2])
      })

      it('does nothing when no workflow is set', () => {
        useWorkflowStore.setState({ currentWorkflow: null })

        const trigger = createManualTrigger('test-trigger-1', false)
        useWorkflowStore.getState().addTrigger(trigger)

        expect(useWorkflowStore.getState().currentWorkflow).toBeNull()
      })
    })

    describe('removeTrigger', () => {
      it('removes trigger by index', () => {
        const trigger1 = createManualTrigger('test-trigger-1', false)
        const trigger2 = createManualTrigger('test-trigger-2', true)

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

      it('removes edges connected to deleted trigger', () => {
        const workflow = makeWorkflow('Test', [createScriptActivity('activity-1', 'Script', 'python', '')])
        const trigger1 = createManualTrigger('test-trigger-1', false)
        const trigger2 = createManualTrigger('test-trigger-2', true)

        useWorkflowStore.setState({ currentWorkflow: workflow })
        useWorkflowStore.getState().addTrigger(trigger1)
        useWorkflowStore.getState().addTrigger(trigger2)

        // Create edges using real trigger IDs (how they are in the actual app)
        const edges: EdgeConnection[] = [
          { id: 'test-trigger-1-activity-1', source: 'test-trigger-1', target: 'activity-1', sourceHandle: 'source' },
          { id: 'test-trigger-2-activity-1', source: 'test-trigger-2', target: 'activity-1', sourceHandle: 'source' },
        ]
        useWorkflowStore.setState({ edges })

        // Remove trigger-0 (test-trigger-1)
        useWorkflowStore.getState().removeTrigger(0)

        const state = useWorkflowStore.getState()
        // Edge from deleted trigger test-trigger-1 should be removed
        expect(state.edges).toHaveLength(1)
        // Remaining edge should still reference test-trigger-2 (real ID doesn't change)
        expect(state.edges[0]).toEqual({
          id: 'test-trigger-2-activity-1',
          source: 'test-trigger-2',
          target: 'activity-1',
          sourceHandle: 'source',
        })
      })

      it('removes edge when trigger is deleted from middle', () => {
        const workflow = makeWorkflow('Test', [createScriptActivity('activity-1', 'Script', 'python', '')])
        const trigger1 = createManualTrigger('test-trigger-1', false)
        const trigger2 = createManualTrigger('test-trigger-2', true)
        const trigger3 = createManualTrigger('test-trigger-3', false)

        useWorkflowStore.setState({ currentWorkflow: workflow })
        useWorkflowStore.getState().addTrigger(trigger1)
        useWorkflowStore.getState().addTrigger(trigger2)
        useWorkflowStore.getState().addTrigger(trigger3)

        // Create edges using real trigger IDs (how they are in the actual app)
        const edges: EdgeConnection[] = [
          { id: 'test-trigger-1-activity-1', source: 'test-trigger-1', target: 'activity-1', sourceHandle: 'source' },
          { id: 'test-trigger-2-activity-1', source: 'test-trigger-2', target: 'activity-1', sourceHandle: 'source' },
          { id: 'test-trigger-3-activity-1', source: 'test-trigger-3', target: 'activity-1', sourceHandle: 'source' },
        ]
        useWorkflowStore.setState({ edges })

        // Remove trigger-1 (test-trigger-2, middle one)
        useWorkflowStore.getState().removeTrigger(1)

        const state = useWorkflowStore.getState()
        // Edge from deleted trigger test-trigger-2 should be removed
        // Other edges remain unchanged (real IDs don't shift)
        expect(state.edges).toHaveLength(2)
        expect(state.edges).toContainEqual({
          id: 'test-trigger-1-activity-1',
          source: 'test-trigger-1',
          target: 'activity-1',
          sourceHandle: 'source',
        })
        expect(state.edges).toContainEqual({
          id: 'test-trigger-3-activity-1',
          source: 'test-trigger-3',
          target: 'activity-1',
          sourceHandle: 'source',
        })
      })

      it('handles edges with trigger as target', () => {
        const workflow = makeWorkflow('Test', [createScriptActivity('activity-1', 'Script', 'python', '')])
        const trigger1 = createManualTrigger('test-trigger-1', false)
        const trigger2 = createManualTrigger('test-trigger-2', true)

        useWorkflowStore.setState({ currentWorkflow: workflow })
        useWorkflowStore.getState().addTrigger(trigger1)
        useWorkflowStore.getState().addTrigger(trigger2)

        // Create edges using real trigger IDs (how they are in the actual app)
        const edges: EdgeConnection[] = [
          { id: 'activity-1-test-trigger-1', source: 'activity-1', target: 'test-trigger-1', sourceHandle: 'source' },
          { id: 'activity-1-test-trigger-2', source: 'activity-1', target: 'test-trigger-2', sourceHandle: 'source' },
        ]
        useWorkflowStore.setState({ edges })

        // Remove trigger-0 (test-trigger-1)
        useWorkflowStore.getState().removeTrigger(0)

        const state = useWorkflowStore.getState()
        expect(state.edges).toHaveLength(1)
        // Remaining edge still references test-trigger-2 (real ID doesn't change)
        expect(state.edges[0]).toEqual({
          id: 'activity-1-test-trigger-2',
          source: 'activity-1',
          target: 'test-trigger-2',
          sourceHandle: 'source',
        })
      })
    })

    describe('updateTrigger', () => {
      it('updates trigger at index', () => {
        const trigger1 = createManualTrigger('test-trigger-1', false)
        const trigger2 = createManualTrigger('test-trigger-2', true)

        useWorkflowStore.getState().addTrigger(trigger1)
        useWorkflowStore.getState().updateTrigger(0, trigger2)

        const state = useWorkflowStore.getState()
        expect(state.currentWorkflow?.triggers?.[0]).toEqual(trigger2)
      })
    })
  })

  describe('Activity management', () => {
    beforeEach(() => {
      useWorkflowStore.getState().setWorkflow(makeWorkflow('Test Workflow'))
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

      it('removes converge activity from flat list', () => {
        const activityB = createScriptActivity('B', 'Task B', 'python', 'print("B")')
        const activityC = createScriptActivity('C', 'Task C', 'python', 'print("C")')
        const convergeActivity = createConvergeActivity('J', 'Converge J')

        useWorkflowStore.setState({
          currentWorkflow: makeWorkflow('Test', [activityB, activityC, convergeActivity]),
          workflowVersion: 1,
          edges: [],
        })

        useWorkflowStore.getState().removeActivity('J')

        const state = useWorkflowStore.getState()
        const activities = state.currentWorkflow?.workflow.activities ?? []

        // Join should be removed
        expect(activities.find((a) => a.id === 'J')).toBeUndefined()
        // Other activities should remain
        expect(activities.find((a) => a.id === 'B')).toBeDefined()
        expect(activities.find((a) => a.id === 'C')).toBeDefined()
      })

      it('removes condition activity from flat list', () => {
        const conditionActivity: Activity = {
          type: 'condition',
          id: 'A',
          name: 'Condition A',
          config: { condition: 'input.value > 10' },
        }
        const activityB = createScriptActivity('B', 'Task B', 'python', 'print("B")')
        const activityC = createScriptActivity('C', 'Task C', 'python', 'print("C")')

        useWorkflowStore.setState({
          currentWorkflow: makeWorkflow('Test', [conditionActivity, activityB, activityC]),
          workflowVersion: 1,
          edges: [],
        })

        useWorkflowStore.getState().removeActivity('A')

        const state = useWorkflowStore.getState()
        const activities = state.currentWorkflow?.workflow.activities ?? []

        expect(activities.find((a) => a.id === 'A')).toBeUndefined()
        expect(activities).toHaveLength(2)
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

      it('updates condition activity in flat list', () => {
        const conditionActivity: Activity = {
          type: 'condition',
          id: 'A',
          name: 'Condition A',
          config: { condition: 'input.value > 10' },
        }

        useWorkflowStore.setState({
          currentWorkflow: makeWorkflow('Test', [conditionActivity]),
          workflowVersion: 1,
          edges: [],
        })

        useWorkflowStore.getState().updateActivity('A', { name: 'Updated Condition' })

        const state = useWorkflowStore.getState()
        expect(state.currentWorkflow?.workflow.activities[0].name).toBe('Updated Condition')
      })
    })
  })

  describe('moveActivityBefore', () => {
    it('moves activity before target', () => {
      const activity1 = createScriptActivity('A', 'Task A', 'python', 'print("A")')
      const activity2 = createScriptActivity('B', 'Task B', 'python', 'print("B")')
      const activity3 = createScriptActivity('C', 'Task C', 'python', 'print("C")')

      useWorkflowStore.setState({
        currentWorkflow: makeWorkflow('Test', [activity1, activity2, activity3]),
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
        currentWorkflow: makeWorkflow('Test', [activity1, activity2]),
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
        currentWorkflow: makeWorkflow('Test', [activity1, activity2, activity3]),
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
        currentWorkflow: makeWorkflow('Test', [activity1, activity2]),
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
        type: 'generic',
        id: 'generic-1',
        name: 'Placeholder',
        config: {},
        metadata: {
          __isGeneric: true,
        },
      })
    })

    it('creates generic node with metadata', () => {
      const activity = createGenericActivity('generic-1', 'Test')

      expect((activity.metadata as { __isGeneric?: boolean })?.__isGeneric).toBe(true)
    })

    it('uses default name when not provided', () => {
      const activity = createGenericActivity('generic-1')

      expect(activity.name).toBe('New Step')
    })

    it('includes custom message in metadata when provided', () => {
      const activity = createGenericActivity('generic-1', 'Test', 'Custom message here')

      expect(activity.metadata as Record<string, unknown>).toMatchObject({
        __isGeneric: true,
        __customMessage: 'Custom message here',
      })
    })

    it('does not include custom message when not provided', () => {
      const activity = createGenericActivity('generic-1', 'Test')

      expect(activity.metadata).toEqual({
        __isGeneric: true,
      })
    })

    it('always sets __isGeneric to true', () => {
      const activity = createGenericActivity('generic-1', 'Test')

      expect(activity.metadata).toHaveProperty('__isGeneric', true)
    })
  })

  describe('duplicateActivity', () => {
    const baseWorkflow = makeWorkflow('Test')

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
      expect(clone?.type).toBe('script')
      expect(clone?.config).toEqual(original.config)
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
    const baseWorkflow = makeWorkflow('Test')

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
        config: { condition: 'some.expr' },
      }
      const scriptActivity = createScriptActivity('tmp-id', 'Script Node', 'python', 'print(1)')
      useWorkflowStore.getState().addActivity(conditionActivity)

      useWorkflowStore.getState().replaceActivity('cond-1', { ...scriptActivity, id: 'cond-1' })

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities ?? []
      const replaced = activities[0] as Record<string, unknown>
      expect(replaced.type).toBe('script')
      // v2: condition expression is inside config, so replaced activity should have script config
      expect((replaced.config as Record<string, unknown>).condition).toBeUndefined()
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

    it('removes type-specific outgoing edges when replacing a condition node with a script node', () => {
      const conditionActivity: Activity = {
        type: 'condition',
        id: 'cond-1',
        name: 'My Condition',
        config: { condition: 'some.expr' },
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

    it('removes approval-specific outgoing edges when replacing an approval node with a script node', () => {
      const approvalActivity: Activity = {
        type: 'approval',
        id: 'appr-1',
        name: 'My Approval',
        config: {},
      }
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

    it('removes loop-specific outgoing edges when replacing a loop node with a script node', () => {
      const loopActivity: Activity = {
        type: 'loop',
        id: 'loop-1',
        name: 'My Loop',
        config: { type: 'for_each', items: '{{ items }}' },
      }
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

  describe('undo/redo (temporal middleware)', () => {
    beforeEach(() => {
      useWorkflowStore.setState({ _temporalBatchPending: false })
      useWorkflowStore.temporal.getState().resume()
      useWorkflowStore.temporal.getState().clear()
    })

    // Simulate edge sync completing the temporal batch started by addActivity
    function completeTemporalBatch() {
      useWorkflowStore.setState({ _temporalBatchPending: false })
      useWorkflowStore.temporal.getState().resume()
    }

    // --- Activity undo/redo ---

    it('undoes the last activity addition', () => {
      const workflow = makeWorkflow('Test')
      useWorkflowStore.getState().loadWorkflowWithEdges(workflow, [])

      useWorkflowStore.getState().addActivity(createScriptActivity('a1', 'Step 1', 'python', 'pass'))
      completeTemporalBatch()
      expect(useWorkflowStore.getState().currentWorkflow?.workflow.activities).toHaveLength(1)

      useWorkflowStore.temporal.getState().undo()
      expect(useWorkflowStore.getState().currentWorkflow?.workflow.activities).toHaveLength(0)
    })

    it('redoes after undo', () => {
      const workflow = makeWorkflow('Test')
      useWorkflowStore.getState().loadWorkflowWithEdges(workflow, [])

      useWorkflowStore.getState().addActivity(createScriptActivity('a1', 'Step 1', 'python', 'pass'))
      completeTemporalBatch()

      useWorkflowStore.temporal.getState().undo()
      expect(useWorkflowStore.getState().currentWorkflow?.workflow.activities).toHaveLength(0)

      useWorkflowStore.temporal.getState().redo()
      expect(useWorkflowStore.getState().currentWorkflow?.workflow.activities).toHaveLength(1)
    })

    // --- Edge undo ---

    it('undoes edge changes', () => {
      useWorkflowStore.getState().loadWorkflowWithEdges(makeWorkflow('Test'), [])

      const edges: EdgeConnection[] = [
        { id: 'e1', source: 'a', target: 'b', sourceHandle: 'source', targetHandle: 'target' },
      ]
      useWorkflowStore.getState().setEdges(edges)
      expect(useWorkflowStore.getState().edges).toHaveLength(1)

      useWorkflowStore.temporal.getState().undo()
      expect(useWorkflowStore.getState().edges).toHaveLength(0)
    })

    // --- Multiple undo steps ---

    it('supports multiple undo steps', () => {
      useWorkflowStore.getState().loadWorkflowWithEdges(makeWorkflow('v0'), [])

      useWorkflowStore.getState().updateWorkflow((wf) => ({ ...wf, name: 'v1' }))
      useWorkflowStore.getState().updateWorkflow((wf) => ({ ...wf, name: 'v2' }))
      useWorkflowStore.getState().updateWorkflow((wf) => ({ ...wf, name: 'v3' }))

      expect(useWorkflowStore.getState().currentWorkflow?.name).toBe('v3')

      useWorkflowStore.temporal.getState().undo()
      expect(useWorkflowStore.getState().currentWorkflow?.name).toBe('v2')

      useWorkflowStore.temporal.getState().undo()
      expect(useWorkflowStore.getState().currentWorkflow?.name).toBe('v1')

      useWorkflowStore.temporal.getState().undo()
      expect(useWorkflowStore.getState().currentWorkflow?.name).toBe('v0')
    })

    // --- Exclusions ---

    it('does not create undo entry for markClean/markDirty (not tracked)', () => {
      useWorkflowStore.getState().loadWorkflowWithEdges(makeWorkflow('Test'), [])
      const pastBefore = useWorkflowStore.temporal.getState().pastStates.length

      useWorkflowStore.getState().markDirty()
      useWorkflowStore.getState().markClean()

      expect(useWorkflowStore.temporal.getState().pastStates.length).toBe(pastBefore)
    })

    // --- History cleared on workflow load ---

    it('clears history when a new workflow is loaded via setWorkflow', () => {
      useWorkflowStore.getState().loadWorkflowWithEdges(makeWorkflow('Workflow 1'), [])
      useWorkflowStore.getState().updateWorkflow((wf) => ({ ...wf, name: 'changed' }))
      expect(useWorkflowStore.temporal.getState().pastStates.length).toBeGreaterThan(0)

      useWorkflowStore.getState().setWorkflow(makeWorkflow('Workflow 2'))
      expect(useWorkflowStore.temporal.getState().pastStates.length).toBe(0)
      expect(useWorkflowStore.temporal.getState().futureStates.length).toBe(0)
    })

    it('clears history when a new workflow is loaded via loadWorkflowWithEdges', () => {
      useWorkflowStore.getState().loadWorkflowWithEdges(makeWorkflow('Workflow 1'), [])
      useWorkflowStore.getState().updateWorkflow((wf) => ({ ...wf, name: 'changed' }))
      expect(useWorkflowStore.temporal.getState().pastStates.length).toBeGreaterThan(0)

      useWorkflowStore.getState().loadWorkflowWithEdges(makeWorkflow('Workflow 2'), [])
      expect(useWorkflowStore.temporal.getState().pastStates.length).toBe(0)
    })
  })

  describe('replaceWorkflowContent', () => {
    beforeEach(() => {
      useWorkflowStore.setState({ _temporalBatchPending: false, _preserveHistoryOnLayout: false })
      useWorkflowStore.temporal.getState().resume()
      useWorkflowStore.temporal.getState().clear()
    })

    it('replaces workflow and edges', () => {
      const original = makeWorkflow('Original')
      useWorkflowStore.getState().loadWorkflowWithEdges(original, [])

      const replacement = makeWorkflow('Replacement', [createScriptActivity('a1', 'Step', 'python', 'pass')])
      const newEdges: EdgeConnection[] = [
        { id: 'e1', source: 'a', target: 'b', sourceHandle: 'source', targetHandle: 'target' },
      ]
      useWorkflowStore.getState().replaceWorkflowContent(replacement, newEdges)

      const state = useWorkflowStore.getState()
      expect(state.currentWorkflow?.name).toBe('Replacement')
      expect(state.edges).toEqual(newEdges)
    })

    it('increments workflowVersion', () => {
      useWorkflowStore.getState().loadWorkflowWithEdges(makeWorkflow('V1'), [])
      const versionBefore = useWorkflowStore.getState().workflowVersion

      useWorkflowStore.getState().replaceWorkflowContent(makeWorkflow('V2'), [])

      expect(useWorkflowStore.getState().workflowVersion).toBe(versionBefore + 1)
    })

    it('sets isDirty to true', () => {
      useWorkflowStore.getState().loadWorkflowWithEdges(makeWorkflow('Clean'), [])
      expect(useWorkflowStore.getState().isDirty).toBe(false)

      useWorkflowStore.getState().replaceWorkflowContent(makeWorkflow('Dirty'), [])

      expect(useWorkflowStore.getState().isDirty).toBe(true)
    })

    it('resets nodePositions', () => {
      useWorkflowStore.setState({ nodePositions: { node1: { x: 100, y: 200 } } })

      useWorkflowStore.getState().replaceWorkflowContent(makeWorkflow('New'), [])

      expect(useWorkflowStore.getState().nodePositions).toEqual({})
    })

    it('sets _preserveHistoryOnLayout to true', () => {
      expect(useWorkflowStore.getState()._preserveHistoryOnLayout).toBe(false)

      useWorkflowStore.getState().replaceWorkflowContent(makeWorkflow('New'), [])

      expect(useWorkflowStore.getState()._preserveHistoryOnLayout).toBe(true)
    })

    it('preserves undo history (does not clear temporal)', () => {
      useWorkflowStore.getState().loadWorkflowWithEdges(makeWorkflow('Initial'), [])
      useWorkflowStore.getState().updateWorkflow((wf) => ({ ...wf, name: 'Changed' }))
      const historyBefore = useWorkflowStore.temporal.getState().pastStates.length
      expect(historyBefore).toBeGreaterThan(0)

      // Resume temporal so replaceWorkflowContent's state change is tracked
      useWorkflowStore.temporal.getState().resume()
      useWorkflowStore.getState().replaceWorkflowContent(makeWorkflow('Imported'), [])

      // History should still exist (not cleared like loadWorkflowWithEdges does)
      expect(useWorkflowStore.temporal.getState().pastStates.length).toBeGreaterThanOrEqual(historyBefore)
    })
  })
})
