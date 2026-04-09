import { describe, expect, it, beforeEach } from 'vitest'

import { useWorkflowStore, createScriptActivity, createConvergeActivity } from './useWorkflowStore'
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

describe.skip('useWorkflowStore - syncConvergeNodeBranches (OLD architecture - needs rewrite)', () => {
  beforeEach(() => {
    useWorkflowStore.setState({
      currentWorkflow: null,
      workflowVersion: 0,
      edges: [],
    })
  })

  describe('Converge with 2+ incoming edges', () => {
    it('updates converge config.branches from incoming edges', () => {
      const activityB = createScriptActivity('B', 'Task B', 'python', 'print("B")')
      const activityC = createScriptActivity('C', 'Task C', 'python', 'print("C")')
      const convergeActivity = createConvergeActivity('J', 'Converge J')

      useWorkflowStore.setState({
        currentWorkflow: makeWorkflow('Test', [activityB, activityC, convergeActivity]),
        workflowVersion: 1,
        edges: [
          { id: 'B-J', source: 'B', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
          { id: 'C-J', source: 'C', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
        ],
      })

      useWorkflowStore.getState().syncConvergeNodeBranches()

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities ?? []
      const converge = activities.find((a) => a.id === 'J')

      expect(converge?.config.branches).toContain('B')
      expect(converge?.config.branches).toContain('C')
      expect(converge?.config.branches).toHaveLength(2)
    })

    it('updates converge config.branches for three incoming edges', () => {
      const activityB = createScriptActivity('B', 'Task B', 'python', 'print("B")')
      const activityC = createScriptActivity('C', 'Task C', 'python', 'print("C")')
      const activityD = createScriptActivity('D', 'Task D', 'python', 'print("D")')
      const convergeActivity = createConvergeActivity('J', 'Converge J')

      useWorkflowStore.setState({
        currentWorkflow: makeWorkflow('Test', [activityB, activityC, activityD, convergeActivity]),
        workflowVersion: 1,
        edges: [
          { id: 'B-J', source: 'B', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
          { id: 'C-J', source: 'C', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
          { id: 'D-J', source: 'D', target: 'J', sourceHandle: 'source', targetHandle: 'target' },
        ],
      })

      useWorkflowStore.getState().syncConvergeNodeBranches()

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities ?? []
      const converge = activities.find((a) => a.id === 'J')

      const branches = converge?.config.branches as string[]
      expect(branches.sort()).toEqual(['B', 'C', 'D'])
    })
  })

  describe('Converge with single incoming edge', () => {
    it('sets single branch in converge config', () => {
      const activityB = createScriptActivity('B', 'Task B', 'python', 'print("B")')
      const convergeActivity = createConvergeActivity('J', 'Converge J')

      useWorkflowStore.setState({
        currentWorkflow: makeWorkflow('Test', [activityB, convergeActivity]),
        workflowVersion: 1,
        edges: [{ id: 'B-J', source: 'B', target: 'J', sourceHandle: 'source', targetHandle: 'target' }],
      })

      useWorkflowStore.getState().syncConvergeNodeBranches()

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities ?? []
      const converge = activities.find((a) => a.id === 'J')

      expect(converge?.config.branches).toEqual(['B'])
    })
  })

  describe('Converge with no incoming edges', () => {
    it('clears converge branches', () => {
      const activityB = createScriptActivity('B', 'Task B', 'python', 'print("B")')
      const convergeActivity = createConvergeActivity('J', 'Converge J')

      useWorkflowStore.setState({
        currentWorkflow: makeWorkflow('Test', [activityB, convergeActivity]),
        workflowVersion: 1,
        edges: [],
      })

      useWorkflowStore.getState().syncConvergeNodeBranches()

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities ?? []
      const converge = activities.find((a) => a.id === 'J')

      expect(converge?.config.branches).toEqual([])
    })
  })

  describe('Multiple converges', () => {
    it('handles multiple independent converges', () => {
      const activityB = createScriptActivity('B', 'Task B', 'python', 'print("B")')
      const activityC = createScriptActivity('C', 'Task C', 'python', 'print("C")')
      const activityD = createScriptActivity('D', 'Task D', 'python', 'print("D")')
      const activityE = createScriptActivity('E', 'Task E', 'python', 'print("E")')
      const convergeJ1 = createConvergeActivity('J1', 'Converge 1')
      const convergeJ2 = createConvergeActivity('J2', 'Converge 2')

      useWorkflowStore.setState({
        currentWorkflow: makeWorkflow('Test', [activityB, activityC, activityD, activityE, convergeJ1, convergeJ2]),
        workflowVersion: 1,
        edges: [
          { id: 'B-J1', source: 'B', target: 'J1', sourceHandle: 'source', targetHandle: 'target' },
          { id: 'C-J1', source: 'C', target: 'J1', sourceHandle: 'source', targetHandle: 'target' },
          { id: 'D-J2', source: 'D', target: 'J2', sourceHandle: 'source', targetHandle: 'target' },
          { id: 'E-J2', source: 'E', target: 'J2', sourceHandle: 'source', targetHandle: 'target' },
        ],
      })

      useWorkflowStore.getState().syncConvergeNodeBranches()

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities ?? []

      const join1 = activities.find((a) => a.id === 'J1')
      const join2 = activities.find((a) => a.id === 'J2')

      const branches1 = join1?.config.branches as string[]
      const branches2 = join2?.config.branches as string[]

      expect(branches1.sort()).toEqual(['B', 'C'])
      expect(branches2.sort()).toEqual(['D', 'E'])
    })
  })

  describe('Edge cases', () => {
    it('does nothing when no workflow is set', () => {
      useWorkflowStore.setState({ currentWorkflow: null })

      expect(() => useWorkflowStore.getState().syncConvergeNodeBranches()).not.toThrow()
      expect(useWorkflowStore.getState().currentWorkflow).toBeNull()
    })

    it('handles workflow with no joins', () => {
      const activityA = createScriptActivity('A', 'Task A', 'python', 'print("A")')
      const activityB = createScriptActivity('B', 'Task B', 'python', 'print("B")')

      useWorkflowStore.setState({
        currentWorkflow: makeWorkflow('Test', [activityA, activityB]),
        workflowVersion: 1,
        edges: [{ id: 'A-B', source: 'A', target: 'B', sourceHandle: 'source', targetHandle: 'target' }],
      })

      useWorkflowStore.getState().syncConvergeNodeBranches()

      const activities = useWorkflowStore.getState().currentWorkflow?.workflow.activities ?? []
      expect(activities).toHaveLength(2)
      expect(activities.map((a) => a.id)).toEqual(['A', 'B'])
    })
  })
})
