import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, beforeEach, vi } from 'vitest'

import {
  useWorkflowStore,
  createScriptActivity,
  createManualTrigger,
  // New typed selectors
  selectCurrentWorkflow,
  selectWorkflowVersion,
  selectEdges,
  selectActivities,
  selectTriggers,
  selectActivitiesCount,
  selectTriggersCount,
  selectWorkflowName,
  selectHasWorkflow,
  // Action accessor
  useWorkflowStoreActions,
  // Custom hooks
  useWorkflowVersion,
  useCurrentWorkflow,
  useEdges,
  useActivities,
  useTriggers,
  useActivitiesCount,
  useTriggersCount,
  useWorkflowName,
  useHasWorkflow,
} from './useWorkflowStore'

type WorkflowDefinition = WorkflowAPI.components['schemas']['workflow-definition.schema']

describe('useWorkflowStore - Selectors and Best Practices', () => {
  beforeEach(() => {
    useWorkflowStore.setState({
      currentWorkflow: null,
      workflowVersion: 0,
      edges: [],
    })
  })

  describe('Selective subscriptions', () => {
    it('only re-renders when selected state changes', () => {
      const workflow: WorkflowDefinition = {
        name: 'Test Workflow',
        triggers: [],
        workflow: {
          activities: [],
        },
      }

      // Track render count
      let workflowVersionRenderCount = 0

      const { result } = renderHook(() => {
        workflowVersionRenderCount++
        return useWorkflowStore((state) => state.workflowVersion)
      })

      expect(workflowVersionRenderCount).toBe(1)
      expect(result.current).toBe(0)

      // Setting workflow should increment version and trigger re-render
      act(() => {
        useWorkflowStore.getState().setWorkflow(workflow)
      })

      expect(workflowVersionRenderCount).toBe(2)
      expect(result.current).toBe(1)

      // Setting edges should NOT trigger re-render for workflowVersion selector
      act(() => {
        useWorkflowStore
          .getState()
          .setEdges([{ id: 'A-B', source: 'A', target: 'B', sourceHandle: 'source', targetHandle: 'target' }])
      })

      // Should still be 2 renders - edges change doesn't affect workflowVersion
      expect(workflowVersionRenderCount).toBe(2)
    })

    it('re-renders when subscribed state slice changes', () => {
      let edgesRenderCount = 0

      const { result } = renderHook(() => {
        edgesRenderCount++
        return useWorkflowStore((state) => state.edges)
      })

      expect(edgesRenderCount).toBe(1)
      expect(result.current).toEqual([])

      // Setting edges should trigger re-render
      act(() => {
        useWorkflowStore
          .getState()
          .setEdges([{ id: 'A-B', source: 'A', target: 'B', sourceHandle: 'source', targetHandle: 'target' }])
      })

      expect(edgesRenderCount).toBe(2)
      expect(result.current).toHaveLength(1)
    })
  })

  describe('Derived state selectors', () => {
    it('computes activitiesCount correctly', () => {
      const workflow: WorkflowDefinition = {
        name: 'Test Workflow',
        triggers: [],
        workflow: {
          activities: [
            createScriptActivity('A', 'Task A', 'python', 'print("A")'),
            createScriptActivity('B', 'Task B', 'python', 'print("B")'),
          ],
        },
      }

      const { result } = renderHook(() =>
        useWorkflowStore((state) => state.currentWorkflow?.workflow.activities.length ?? 0)
      )

      expect(result.current).toBe(0)

      act(() => {
        useWorkflowStore.getState().setWorkflow(workflow)
      })

      expect(result.current).toBe(2)
    })

    it('computes triggersCount correctly', () => {
      const workflow: WorkflowDefinition = {
        name: 'Test Workflow',
        triggers: [createManualTrigger(false), createManualTrigger(true)],
        workflow: {
          activities: [],
        },
      }

      const { result } = renderHook(() => useWorkflowStore((state) => state.currentWorkflow?.triggers?.length ?? 0))

      expect(result.current).toBe(0)

      act(() => {
        useWorkflowStore.getState().setWorkflow(workflow)
      })

      expect(result.current).toBe(2)
    })

    it('computes hasWorkflow correctly', () => {
      const { result } = renderHook(() => useWorkflowStore((state) => state.currentWorkflow !== null))

      expect(result.current).toBe(false)

      act(() => {
        useWorkflowStore.getState().setWorkflow({
          name: 'Test',
          triggers: [],
          workflow: { activities: [] },
        })
      })

      expect(result.current).toBe(true)
    })
  })

  describe('Action access patterns', () => {
    it('allows accessing actions without subscribing to state changes', () => {
      let renderCount = 0

      // This pattern accesses actions directly from getState() instead of subscribing
      const { result } = renderHook(() => {
        renderCount++
        // Access actions via getState() - no subscription to state
        return {
          setWorkflow: useWorkflowStore.getState().setWorkflow,
          addActivity: useWorkflowStore.getState().addActivity,
        }
      })

      expect(renderCount).toBe(1)

      // Changing state should NOT trigger re-render when only using actions
      act(() => {
        result.current.setWorkflow({
          name: 'Test',
          triggers: [],
          workflow: { activities: [] },
        })
      })

      // Should still be 1 render - we're not subscribed to state
      expect(renderCount).toBe(1)
    })

    it('allows combining state subscription with action access', () => {
      let renderCount = 0

      const { result } = renderHook(() => {
        renderCount++
        // Subscribe to specific state
        const workflowVersion = useWorkflowStore((state) => state.workflowVersion)
        // Access actions directly (doesn't add subscription)
        const { setWorkflow, addActivity } = useWorkflowStore.getState()
        return { workflowVersion, setWorkflow, addActivity }
      })

      expect(renderCount).toBe(1)
      expect(result.current.workflowVersion).toBe(0)

      // Setting workflow increments version - should trigger re-render
      act(() => {
        result.current.setWorkflow({
          name: 'Test',
          triggers: [],
          workflow: { activities: [] },
        })
      })

      expect(renderCount).toBe(2)
      expect(result.current.workflowVersion).toBe(1)
    })
  })

  describe('Multiple selector subscriptions', () => {
    it('handles multiple independent selectors efficiently', () => {
      let versionRenderCount = 0
      let edgesRenderCount = 0

      // Version selector
      const { result: versionResult } = renderHook(() => {
        versionRenderCount++
        return useWorkflowStore((state) => state.workflowVersion)
      })

      // Edges selector
      const { result: edgesResult } = renderHook(() => {
        edgesRenderCount++
        return useWorkflowStore((state) => state.edges)
      })

      expect(versionRenderCount).toBe(1)
      expect(edgesRenderCount).toBe(1)

      // Change edges - only edges selector should re-render
      act(() => {
        useWorkflowStore
          .getState()
          .setEdges([{ id: 'A-B', source: 'A', target: 'B', sourceHandle: 'source', targetHandle: 'target' }])
      })

      expect(versionRenderCount).toBe(1) // No change
      expect(edgesRenderCount).toBe(2) // Re-rendered

      // Change workflow version - only version selector should re-render
      act(() => {
        useWorkflowStore.getState().setWorkflow({
          name: 'Test',
          triggers: [],
          workflow: { activities: [] },
        })
      })

      expect(versionRenderCount).toBe(2) // Re-rendered
      expect(edgesRenderCount).toBe(2) // No change

      expect(versionResult.current).toBe(1)
      expect(edgesResult.current).toHaveLength(1)
    })
  })

  describe('Direct state access via getState()', () => {
    it('allows synchronous state access outside React', () => {
      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test Workflow',
          triggers: [],
          workflow: {
            activities: [createScriptActivity('A', 'Task A', 'python', 'print("A")')],
          },
        },
        workflowVersion: 1,
        edges: [],
      })

      // Direct access without React hooks
      const state = useWorkflowStore.getState()
      expect(state.currentWorkflow?.name).toBe('Test Workflow')
      expect(state.workflowVersion).toBe(1)
      expect(state.currentWorkflow?.workflow.activities).toHaveLength(1)
    })

    it('allows calling actions directly via getState()', () => {
      const store = useWorkflowStore

      // Set workflow directly
      store.getState().setWorkflow({
        name: 'Test',
        triggers: [],
        workflow: { activities: [] },
      })

      expect(store.getState().currentWorkflow?.name).toBe('Test')

      // Add activity directly
      store.getState().addActivity(createScriptActivity('A', 'Task A', 'python', 'print("A")'))

      expect(store.getState().currentWorkflow?.workflow.activities).toHaveLength(1)
    })
  })

  describe('Store subscription outside React', () => {
    it('allows subscribing to store changes', () => {
      const listener = vi.fn()
      const unsubscribe = useWorkflowStore.subscribe(listener)

      useWorkflowStore.getState().setWorkflow({
        name: 'Test',
        triggers: [],
        workflow: { activities: [] },
      })

      expect(listener).toHaveBeenCalled()
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ workflowVersion: 1 }),
        expect.objectContaining({ workflowVersion: 0 })
      )

      unsubscribe()
    })

    it('allows selective subscriptions outside React using manual comparison', () => {
      const listener = vi.fn()

      // Manual selective subscription by comparing previous and current state
      // This pattern works without the subscribeWithSelector middleware
      let prevVersion = useWorkflowStore.getState().workflowVersion
      const unsubscribe = useWorkflowStore.subscribe((state) => {
        const currentVersion = state.workflowVersion
        if (currentVersion !== prevVersion) {
          listener(currentVersion, prevVersion)
          prevVersion = currentVersion
        }
      })

      // Setting workflow should trigger listener (changes version)
      useWorkflowStore.getState().setWorkflow({
        name: 'Test',
        triggers: [],
        workflow: { activities: [] },
      })

      expect(listener).toHaveBeenCalledTimes(1)
      expect(listener).toHaveBeenCalledWith(1, 0)

      // Setting edges should NOT trigger listener (doesn't change version)
      useWorkflowStore
        .getState()
        .setEdges([{ id: 'A-B', source: 'A', target: 'B', sourceHandle: 'source', targetHandle: 'target' }])

      expect(listener).toHaveBeenCalledTimes(1) // Still 1

      unsubscribe()
    })
  })

  describe('Immutability guarantees', () => {
    it('creates new state objects on updates', () => {
      const initialWorkflow: WorkflowDefinition = {
        name: 'Initial',
        triggers: [],
        workflow: {
          activities: [createScriptActivity('A', 'Task A', 'python', 'print("A")')],
        },
      }

      useWorkflowStore.getState().setWorkflow(initialWorkflow)

      const stateBefore = useWorkflowStore.getState()
      const workflowBefore = stateBefore.currentWorkflow

      // Update activity
      useWorkflowStore.getState().updateActivity('A', { name: 'Updated Task A' })

      const stateAfter = useWorkflowStore.getState()
      const workflowAfter = stateAfter.currentWorkflow

      // State objects should be different references
      expect(stateAfter).not.toBe(stateBefore)
      expect(workflowAfter).not.toBe(workflowBefore)

      // Original values should not be mutated
      expect(workflowBefore?.workflow.activities[0].name).toBe('Task A')
      expect(workflowAfter?.workflow.activities[0].name).toBe('Updated Task A')
    })

    it('maintains immutability on array operations', () => {
      useWorkflowStore.getState().setWorkflow({
        name: 'Test',
        triggers: [],
        workflow: { activities: [] },
      })

      const edgesBefore = useWorkflowStore.getState().edges

      useWorkflowStore
        .getState()
        .setEdges([{ id: 'A-B', source: 'A', target: 'B', sourceHandle: 'source', targetHandle: 'target' }])

      const edgesAfter = useWorkflowStore.getState().edges

      // Arrays should be different references
      expect(edgesAfter).not.toBe(edgesBefore)
      expect(edgesBefore).toHaveLength(0)
      expect(edgesAfter).toHaveLength(1)
    })
  })

  describe('Typed Selectors', () => {
    it('selectCurrentWorkflow returns the workflow or null', () => {
      expect(selectCurrentWorkflow(useWorkflowStore.getState())).toBeNull()

      useWorkflowStore.getState().setWorkflow({
        name: 'Test Workflow',
        triggers: [],
        workflow: { activities: [] },
      })

      expect(selectCurrentWorkflow(useWorkflowStore.getState())?.name).toBe('Test Workflow')
    })

    it('selectWorkflowVersion returns the version number', () => {
      expect(selectWorkflowVersion(useWorkflowStore.getState())).toBe(0)

      useWorkflowStore.getState().setWorkflow({
        name: 'Test',
        triggers: [],
        workflow: { activities: [] },
      })

      expect(selectWorkflowVersion(useWorkflowStore.getState())).toBe(1)
    })

    it('selectEdges returns the edges array', () => {
      expect(selectEdges(useWorkflowStore.getState())).toEqual([])

      useWorkflowStore
        .getState()
        .setEdges([{ id: 'A-B', source: 'A', target: 'B', sourceHandle: 'source', targetHandle: 'target' }])

      expect(selectEdges(useWorkflowStore.getState())).toHaveLength(1)
    })

    it('selectActivities returns activities or undefined', () => {
      expect(selectActivities(useWorkflowStore.getState())).toBeUndefined()

      useWorkflowStore.getState().setWorkflow({
        name: 'Test',
        triggers: [],
        workflow: {
          activities: [createScriptActivity('A', 'Task A', 'python', 'print("A")')],
        },
      })

      expect(selectActivities(useWorkflowStore.getState())).toHaveLength(1)
    })

    it('selectTriggers returns triggers or undefined', () => {
      expect(selectTriggers(useWorkflowStore.getState())).toBeUndefined()

      useWorkflowStore.getState().setWorkflow({
        name: 'Test',
        triggers: [createManualTrigger(false)],
        workflow: { activities: [] },
      })

      expect(selectTriggers(useWorkflowStore.getState())).toHaveLength(1)
    })

    it('selectActivitiesCount returns count with fallback to 0', () => {
      expect(selectActivitiesCount(useWorkflowStore.getState())).toBe(0)

      useWorkflowStore.getState().setWorkflow({
        name: 'Test',
        triggers: [],
        workflow: {
          activities: [
            createScriptActivity('A', 'Task A', 'python', 'print("A")'),
            createScriptActivity('B', 'Task B', 'python', 'print("B")'),
          ],
        },
      })

      expect(selectActivitiesCount(useWorkflowStore.getState())).toBe(2)
    })

    it('selectTriggersCount returns count with fallback to 0', () => {
      expect(selectTriggersCount(useWorkflowStore.getState())).toBe(0)

      useWorkflowStore.getState().setWorkflow({
        name: 'Test',
        triggers: [createManualTrigger(false), createManualTrigger(true)],
        workflow: { activities: [] },
      })

      expect(selectTriggersCount(useWorkflowStore.getState())).toBe(2)
    })

    it('selectWorkflowName returns name or undefined', () => {
      expect(selectWorkflowName(useWorkflowStore.getState())).toBeUndefined()

      useWorkflowStore.getState().setWorkflow({
        name: 'My Workflow',
        triggers: [],
        workflow: { activities: [] },
      })

      expect(selectWorkflowName(useWorkflowStore.getState())).toBe('My Workflow')
    })

    it('selectHasWorkflow returns boolean', () => {
      expect(selectHasWorkflow(useWorkflowStore.getState())).toBe(false)

      useWorkflowStore.getState().setWorkflow({
        name: 'Test',
        triggers: [],
        workflow: { activities: [] },
      })

      expect(selectHasWorkflow(useWorkflowStore.getState())).toBe(true)

      useWorkflowStore.getState().setWorkflow(null)

      expect(selectHasWorkflow(useWorkflowStore.getState())).toBe(false)
    })

    it('selectors work with useWorkflowStore hook', () => {
      useWorkflowStore.getState().setWorkflow({
        name: 'Test',
        triggers: [createManualTrigger(false)],
        workflow: {
          activities: [createScriptActivity('A', 'Task A', 'python', 'print("A")')],
        },
      })

      const { result } = renderHook(() => ({
        version: useWorkflowStore(selectWorkflowVersion),
        hasWorkflow: useWorkflowStore(selectHasWorkflow),
        activitiesCount: useWorkflowStore(selectActivitiesCount),
        triggersCount: useWorkflowStore(selectTriggersCount),
        name: useWorkflowStore(selectWorkflowName),
      }))

      expect(result.current.version).toBe(1)
      expect(result.current.hasWorkflow).toBe(true)
      expect(result.current.activitiesCount).toBe(1)
      expect(result.current.triggersCount).toBe(1)
      expect(result.current.name).toBe('Test')
    })
  })

  describe('useWorkflowStoreActions', () => {
    it('returns all action functions', () => {
      const actions = useWorkflowStoreActions()

      // Check all expected actions are present
      expect(typeof actions.setWorkflow).toBe('function')
      expect(typeof actions.updateWorkflow).toBe('function')
      expect(typeof actions.setEdges).toBe('function')
      expect(typeof actions.addTrigger).toBe('function')
      expect(typeof actions.removeTrigger).toBe('function')
      expect(typeof actions.updateTrigger).toBe('function')
      expect(typeof actions.addActivity).toBe('function')
      expect(typeof actions.removeActivity).toBe('function')
      expect(typeof actions.updateActivity).toBe('function')
      expect(typeof actions.syncConvergeNodeBranches).toBe('function')
      expect(typeof actions.moveActivityBefore).toBe('function')
      expect(typeof actions.moveActivityAfter).toBe('function')
      expect(typeof actions.reorderActivitiesFromEdges).toBe('function')
      expect(typeof actions.batchRemoveNodesAndEdges).toBe('function')
      expect(typeof actions.batchAddActivitiesAndEdges).toBe('function')
    })

    it('updateWorkflow updates currentWorkflow without incrementing workflowVersion', () => {
      const actions = useWorkflowStoreActions()

      actions.setWorkflow({
        name: 'Original',
        triggers: [],
        workflow: { activities: [] },
      })

      expect(useWorkflowStore.getState().workflowVersion).toBe(1)
      expect(useWorkflowStore.getState().currentWorkflow?.name).toBe('Original')

      actions.updateWorkflow((wf) => ({ ...wf, name: 'Updated' }))

      expect(useWorkflowStore.getState().workflowVersion).toBe(1)
      expect(useWorkflowStore.getState().currentWorkflow?.name).toBe('Updated')
    })

    it('updateWorkflow is a no-op when no workflow is loaded', () => {
      const actions = useWorkflowStoreActions()

      expect(useWorkflowStore.getState().currentWorkflow).toBeNull()
      expect(useWorkflowStore.getState().workflowVersion).toBe(0)

      actions.updateWorkflow((wf) => ({ ...wf, name: 'Should not happen' }))

      expect(useWorkflowStore.getState().currentWorkflow).toBeNull()
      expect(useWorkflowStore.getState().workflowVersion).toBe(0)
    })

    it('actions work correctly when called', () => {
      const actions = useWorkflowStoreActions()

      actions.setWorkflow({
        name: 'Test via actions',
        triggers: [],
        workflow: { activities: [] },
      })

      expect(useWorkflowStore.getState().currentWorkflow?.name).toBe('Test via actions')

      actions.addActivity(createScriptActivity('A', 'Task A', 'python', 'print("A")'))

      expect(useWorkflowStore.getState().currentWorkflow?.workflow.activities).toHaveLength(1)
    })

    it('does not cause re-renders when used in components', () => {
      let renderCount = 0

      const { result } = renderHook(() => {
        renderCount++
        return useWorkflowStoreActions()
      })

      expect(renderCount).toBe(1)

      // Calling actions should NOT cause re-render
      act(() => {
        result.current.setWorkflow({
          name: 'Test',
          triggers: [],
          workflow: { activities: [] },
        })
      })

      // The hook itself doesn't re-render (actions are accessed via getState)
      // Note: The renderHook wrapper may re-render, but the point is the
      // component using useWorkflowStoreActions doesn't subscribe to state
      expect(renderCount).toBe(1)
    })
  })

  describe('Custom Hooks', () => {
    beforeEach(() => {
      useWorkflowStore.setState({
        currentWorkflow: {
          name: 'Test Workflow',
          triggers: [createManualTrigger(false), createManualTrigger(true)],
          workflow: {
            activities: [
              createScriptActivity('A', 'Task A', 'python', 'print("A")'),
              createScriptActivity('B', 'Task B', 'python', 'print("B")'),
            ],
          },
        },
        workflowVersion: 5,
        edges: [{ id: 'A-B', source: 'A', target: 'B', sourceHandle: 'source', targetHandle: 'target' }],
      })
    })

    it('useWorkflowVersion returns the version', () => {
      const { result } = renderHook(() => useWorkflowVersion())
      expect(result.current).toBe(5)
    })

    it('useCurrentWorkflow returns the workflow', () => {
      const { result } = renderHook(() => useCurrentWorkflow())
      expect(result.current?.name).toBe('Test Workflow')
    })

    it('useEdges returns the edges array', () => {
      const { result } = renderHook(() => useEdges())
      expect(result.current).toHaveLength(1)
      expect(result.current[0].id).toBe('A-B')
    })

    it('useActivities returns the activities array', () => {
      const { result } = renderHook(() => useActivities())
      expect(result.current).toHaveLength(2)
    })

    it('useTriggers returns the triggers array', () => {
      const { result } = renderHook(() => useTriggers())
      expect(result.current).toHaveLength(2)
    })

    it('useActivitiesCount returns the count', () => {
      const { result } = renderHook(() => useActivitiesCount())
      expect(result.current).toBe(2)
    })

    it('useTriggersCount returns the count', () => {
      const { result } = renderHook(() => useTriggersCount())
      expect(result.current).toBe(2)
    })

    it('useWorkflowName returns the name', () => {
      const { result } = renderHook(() => useWorkflowName())
      expect(result.current).toBe('Test Workflow')
    })

    it('useHasWorkflow returns true when workflow exists', () => {
      const { result } = renderHook(() => useHasWorkflow())
      expect(result.current).toBe(true)
    })

    it('useHasWorkflow returns false when no workflow', () => {
      useWorkflowStore.setState({ currentWorkflow: null })
      const { result } = renderHook(() => useHasWorkflow())
      expect(result.current).toBe(false)
    })

    it('custom hooks re-render when their specific state changes', () => {
      let versionRenderCount = 0
      let edgesRenderCount = 0

      renderHook(() => {
        versionRenderCount++
        return useWorkflowVersion()
      })

      renderHook(() => {
        edgesRenderCount++
        return useEdges()
      })

      expect(versionRenderCount).toBe(1)
      expect(edgesRenderCount).toBe(1)

      // Changing edges should only re-render useEdges hook
      act(() => {
        useWorkflowStore.getState().setEdges([])
      })

      expect(versionRenderCount).toBe(1) // No change
      expect(edgesRenderCount).toBe(2) // Re-rendered
    })
  })
})
