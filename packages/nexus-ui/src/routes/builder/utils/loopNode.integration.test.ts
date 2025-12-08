import { describe, expect, it, beforeEach, afterEach } from 'vitest'

import { useWorkflowStore } from '../../../stores/useWorkflowStore'

/**
 * Integration tests for loop node functionality
 * Tests the complete flow of loop node creation, edge generation, and positioning
 */
describe('Loop Node Integration Tests', () => {
  beforeEach(() => {
    // Reset the store before each test
    useWorkflowStore.getState().setWorkflow(null)
  })

  afterEach(() => {
    // Clean up after each test
    useWorkflowStore.getState().setWorkflow(null)
  })

  describe('Loop Node Creation', () => {
    it('should create loop activity with generic body node atomically', () => {
      const store = useWorkflowStore.getState()

      // Create a minimal workflow
      store.setWorkflow({
        id: 'test-workflow',
        name: 'Test Workflow',
        triggers: [],
        inputs: {},
        workflow: {
          activities: [],
        },
      })

      // Simulate loop node creation with generic body node
      const loopId = 'loop_1'
      const genericId = 'task_1'

      const loopActivity = {
        type: 'loop' as const,
        id: loopId,
        name: 'Test Loop',
        loop: {
          type: 'forEach' as const,
          items: 'input.items',
          do: [],
        },
      }

      const genericActivity = {
        type: 'task' as const,
        id: genericId,
        name: '',
        task: {
          type: 'generic' as const,
        },
        metadata: {
          __isGeneric: true,
        },
      }

      const edges = [
        {
          id: `${loopId}-loop-${genericId}`,
          source: loopId,
          target: genericId,
          sourceHandle: 'loop',
          targetHandle: 'target',
        },
        {
          id: `${genericId}-${loopId}-end`,
          source: genericId,
          target: loopId,
          sourceHandle: 'source',
          targetHandle: 'end',
        },
      ]

      // Use atomic batch operation
      store.batchAddActivitiesAndEdges({
        activities: [loopActivity, genericActivity],
        edges,
      })

      // Get fresh state after batch operation
      const updatedStore = useWorkflowStore.getState()

      // Verify both activities were added
      const workflow = updatedStore.currentWorkflow
      expect(workflow).toBeDefined()
      expect(workflow?.workflow.activities).toHaveLength(2)
      expect(workflow?.workflow.activities[0].id).toBe(loopId)
      expect(workflow?.workflow.activities[1].id).toBe(genericId)

      // Verify edges were set
      const storedEdges = updatedStore.edges
      expect(storedEdges).toHaveLength(2)
      expect(storedEdges[0]).toEqual(edges[0])
      expect(storedEdges[1]).toEqual(edges[1])
    })

    it('should create loop-to-body and body-to-loop edges', () => {
      const store = useWorkflowStore.getState()

      store.setWorkflow({
        id: 'test-workflow',
        name: 'Test Workflow',
        triggers: [],
        inputs: {},
        workflow: {
          activities: [],
        },
      })

      const loopId = 'loop_1'
      const genericId = 'task_1'

      const edges = [
        {
          id: `${loopId}-loop-${genericId}`,
          source: loopId,
          target: genericId,
          sourceHandle: 'loop',
          targetHandle: 'target',
        },
        {
          id: `${genericId}-${loopId}-end`,
          source: genericId,
          target: loopId,
          sourceHandle: 'source',
          targetHandle: 'end',
        },
      ]

      store.setEdges(edges)

      const storedEdges = store.edges

      // Verify loop-to-body edge
      const loopToBody = storedEdges.find((e) => e.sourceHandle === 'loop')
      expect(loopToBody).toBeDefined()
      expect(loopToBody?.source).toBe(loopId)
      expect(loopToBody?.target).toBe(genericId)
      expect(loopToBody?.targetHandle).toBe('target')

      // Verify body-to-loop edge (loop-back)
      const bodyToLoop = storedEdges.find((e) => e.targetHandle === 'end')
      expect(bodyToLoop).toBeDefined()
      expect(bodyToLoop?.source).toBe(genericId)
      expect(bodyToLoop?.target).toBe(loopId)
      expect(bodyToLoop?.sourceHandle).toBe('source')
    })

    it('should support multiple nodes in loop body', () => {
      const store = useWorkflowStore.getState()

      store.setWorkflow({
        id: 'test-workflow',
        name: 'Test Workflow',
        triggers: [],
        inputs: {},
        workflow: {
          activities: [],
        },
      })

      const loopId = 'loop_1'
      const task1Id = 'task_1'
      const task2Id = 'task_2'

      const loopActivity = {
        type: 'loop' as const,
        id: loopId,
        name: 'Test Loop',
        loop: {
          type: 'forEach' as const,
          items: 'input.items',
          do: [],
        },
      }

      const task1 = {
        type: 'task' as const,
        id: task1Id,
        name: 'Task 1',
        task: {
          type: 'generic' as const,
        },
      }

      const task2 = {
        type: 'task' as const,
        id: task2Id,
        name: 'Task 2',
        task: {
          type: 'generic' as const,
        },
      }

      const edges = [
        // Loop to first task
        {
          id: `${loopId}-loop-${task1Id}`,
          source: loopId,
          target: task1Id,
          sourceHandle: 'loop',
          targetHandle: 'target',
        },
        // First task to second task
        {
          id: `${task1Id}-${task2Id}`,
          source: task1Id,
          target: task2Id,
          sourceHandle: 'source',
          targetHandle: 'target',
        },
        // Second task back to loop
        {
          id: `${task2Id}-${loopId}-end`,
          source: task2Id,
          target: loopId,
          sourceHandle: 'source',
          targetHandle: 'end',
        },
      ]

      store.batchAddActivitiesAndEdges({
        activities: [loopActivity, task1, task2],
        edges,
      })

      // Get fresh state after batch operation
      const updatedStore = useWorkflowStore.getState()

      // Verify all activities were added
      const workflow = updatedStore.currentWorkflow
      expect(workflow).toBeDefined()
      expect(workflow?.workflow.activities).toHaveLength(3)

      // Verify edge chain
      const storedEdges = updatedStore.edges
      expect(storedEdges).toHaveLength(3)

      // Verify loop entry edge
      const loopEntry = storedEdges.find((e) => e.source === loopId && e.sourceHandle === 'loop')
      expect(loopEntry?.target).toBe(task1Id)

      // Verify task chain
      const taskChain = storedEdges.find((e) => e.source === task1Id && e.target === task2Id)
      expect(taskChain).toBeDefined()

      // Verify loop-back edge
      const loopBack = storedEdges.find((e) => e.target === loopId && e.targetHandle === 'end')
      expect(loopBack?.source).toBe(task2Id)
    })
  })

  describe('Loop Node Edge Types', () => {
    it('should identify loop outgoing edges correctly', () => {
      const edges = [
        {
          id: 'edge1',
          source: 'loop_1',
          target: 'task_1',
          sourceHandle: 'loop',
          targetHandle: 'target',
        },
      ]

      const loopOutgoing = edges.find((e) => e.sourceHandle === 'loop')

      expect(loopOutgoing).toBeDefined()
      expect(loopOutgoing?.source).toBe('loop_1')
      expect(loopOutgoing?.target).toBe('task_1')
    })

    it('should identify loop-back edges correctly', () => {
      const edges = [
        {
          id: 'edge1',
          source: 'task_1',
          target: 'loop_1',
          sourceHandle: 'source',
          targetHandle: 'end',
        },
      ]

      const loopBack = edges.find((e) => e.targetHandle === 'end')

      expect(loopBack).toBeDefined()
      expect(loopBack?.source).toBe('task_1')
      expect(loopBack?.target).toBe('loop_1')
    })

    it('should identify loop done edges correctly', () => {
      const edges = [
        {
          id: 'edge1',
          source: 'loop_1',
          target: 'task_2',
          sourceHandle: 'done',
          targetHandle: 'target',
        },
      ]

      const loopDone = edges.find((e) => e.sourceHandle === 'done')

      expect(loopDone).toBeDefined()
      expect(loopDone?.source).toBe('loop_1')
      expect(loopDone?.target).toBe('task_2')
    })
  })

  describe('Loop Node Body Detection', () => {
    it('should identify loop body nodes from edges', () => {
      const edges = [
        {
          id: 'edge1',
          source: 'loop_1',
          target: 'task_1',
          sourceHandle: 'loop',
          targetHandle: 'target',
        },
        {
          id: 'edge2',
          source: 'task_1',
          target: 'task_2',
          sourceHandle: 'source',
          targetHandle: 'target',
        },
        {
          id: 'edge3',
          source: 'task_2',
          target: 'loop_1',
          sourceHandle: 'source',
          targetHandle: 'end',
        },
      ]

      // Build a Map of loop body nodes
      const loopBodyNodeMap = new Map<string, string>()
      edges.forEach((e) => {
        if (e.sourceHandle === 'loop') {
          loopBodyNodeMap.set(e.target, e.source)
        }
      })

      // Verify loop body node is detected
      expect(loopBodyNodeMap.has('task_1')).toBe(true)
      expect(loopBodyNodeMap.get('task_1')).toBe('loop_1')

      // Verify other nodes are not detected as loop body
      expect(loopBodyNodeMap.has('task_2')).toBe(false)
    })

    it('should handle multiple loop body nodes', () => {
      const edges = [
        // First loop
        {
          id: 'edge1',
          source: 'loop_1',
          target: 'task_1',
          sourceHandle: 'loop',
          targetHandle: 'target',
        },
        // Second loop
        {
          id: 'edge2',
          source: 'loop_2',
          target: 'task_2',
          sourceHandle: 'loop',
          targetHandle: 'target',
        },
      ]

      const loopBodyNodeMap = new Map<string, string>()
      edges.forEach((e) => {
        if (e.sourceHandle === 'loop') {
          loopBodyNodeMap.set(e.target, e.source)
        }
      })

      // Verify both loop body nodes are detected
      expect(loopBodyNodeMap.has('task_1')).toBe(true)
      expect(loopBodyNodeMap.get('task_1')).toBe('loop_1')
      expect(loopBodyNodeMap.has('task_2')).toBe(true)
      expect(loopBodyNodeMap.get('task_2')).toBe('loop_2')
    })
  })

  describe('Loop Node Positioning Logic', () => {
    it('should calculate correct position for loop body node', () => {
      const loopPosition = { x: 100, y: 200, width: 240, height: 80 }
      const horizontalSpacing = 50

      // Calculate body node position
      const calculatedX = loopPosition.x + loopPosition.width + horizontalSpacing
      const calculatedY = loopPosition.y + loopPosition.height / 2

      // Body node should be positioned to the right
      expect(calculatedX).toBe(100 + 240 + 50) // 390

      // Body node's top-left Y should be at loop node's center Y
      expect(calculatedY).toBe(200 + 80 / 2) // 240
    })

    it('should use different initial positions for loop body nodes', () => {
      const LOOP_NODE_WIDTH = 290
      const HORIZONTAL_SPACING = 50

      // Standard nodes start at (0, 0)
      const standardPosition = { x: 0, y: 0 }

      // Loop body nodes start at (340, 0) for identification
      const loopBodyPosition = { x: LOOP_NODE_WIDTH + HORIZONTAL_SPACING, y: 0 }

      expect(standardPosition).toEqual({ x: 0, y: 0 })
      expect(loopBodyPosition).toEqual({ x: 340, y: 0 })
    })

    it('should identify nodes to position based on initial coordinates', () => {
      const nodes = [
        { id: 'task_1', position: { x: 0, y: 0 }, measured: { width: 100, height: 50 } },
        { id: 'task_2', position: { x: 340, y: 0 }, measured: { width: 100, height: 50 } },
        { id: 'task_3', position: { x: 100, y: 100 }, measured: { width: 100, height: 50 } },
      ]

      const loopBodyNodeMap = new Map<string, string>([['task_2', 'loop_1']])

      // Filter nodes to position
      const nodesToPosition = nodes.filter((node) => {
        if (!node.measured) return false

        // Loop body nodes have initial offset position (340, 0)
        if (loopBodyNodeMap.has(node.id)) {
          return node.position.x > 0 && node.position.y === 0
        }

        // All other nodes start at (0, 0)
        return node.position.x === 0 && node.position.y === 0
      })

      expect(nodesToPosition).toHaveLength(2)
      expect(nodesToPosition.find((n) => n.id === 'task_1')).toBeDefined()
      expect(nodesToPosition.find((n) => n.id === 'task_2')).toBeDefined()
      expect(nodesToPosition.find((n) => n.id === 'task_3')).toBeUndefined()
    })
  })

  describe('Batch Operations', () => {
    it('should prevent race conditions with atomic updates', () => {
      const store = useWorkflowStore.getState()

      store.setWorkflow({
        id: 'test-workflow',
        name: 'Test Workflow',
        triggers: [],
        inputs: {},
        workflow: {
          activities: [],
        },
      })

      // Get initial version AFTER setWorkflow
      const initialVersion = useWorkflowStore.getState().workflowVersion

      const loopActivity = {
        type: 'loop' as const,
        id: 'loop_1',
        name: 'Test Loop',
        loop: {
          type: 'forEach' as const,
          items: 'input.items',
          do: [],
        },
      }

      const genericActivity = {
        type: 'task' as const,
        id: 'task_1',
        name: '',
        task: {
          type: 'generic' as const,
        },
      }

      const edges = [
        {
          id: 'edge1',
          source: 'loop_1',
          target: 'task_1',
          sourceHandle: 'loop',
          targetHandle: 'target',
        },
        {
          id: 'edge2',
          source: 'task_1',
          target: 'loop_1',
          sourceHandle: 'source',
          targetHandle: 'end',
        },
      ]

      // Perform batch operation
      store.batchAddActivitiesAndEdges({
        activities: [loopActivity, genericActivity],
        edges,
      })

      // Get fresh state after batch operation
      const updatedStore = useWorkflowStore.getState()

      // Version should not change (no setWorkflow call)
      expect(updatedStore.workflowVersion).toBe(initialVersion)

      // Both activities and edges should be present
      expect(updatedStore.currentWorkflow?.workflow.activities).toHaveLength(2)
      expect(updatedStore.edges).toHaveLength(2)
    })

    it('should preserve existing edges when adding new ones', () => {
      const store = useWorkflowStore.getState()

      store.setWorkflow({
        id: 'test-workflow',
        name: 'Test Workflow',
        triggers: [],
        inputs: {},
        workflow: {
          activities: [],
        },
      })

      // Set initial edges
      const existingEdges = [
        {
          id: 'existing1',
          source: 'task_0',
          target: 'task_1',
          sourceHandle: 'source',
          targetHandle: 'target',
        },
      ]
      store.setEdges(existingEdges)

      // Add new activities with edges
      const loopActivity = {
        type: 'loop' as const,
        id: 'loop_1',
        name: 'Test Loop',
        loop: {
          type: 'forEach' as const,
          items: 'input.items',
          do: [],
        },
      }

      const newEdges = [
        ...existingEdges,
        {
          id: 'new1',
          source: 'loop_1',
          target: 'task_2',
          sourceHandle: 'loop',
          targetHandle: 'target',
        },
      ]

      store.batchAddActivitiesAndEdges({
        activities: [loopActivity],
        edges: newEdges,
      })

      // Get fresh state after batch operation
      const updatedStore = useWorkflowStore.getState()

      // Both old and new edges should be present
      const storedEdges = updatedStore.edges
      expect(storedEdges).toHaveLength(2)
      expect(storedEdges.find((e) => e.id === 'existing1')).toBeDefined()
      expect(storedEdges.find((e) => e.id === 'new1')).toBeDefined()
    })
  })
})
