import type { Node, ReactFlowInstance } from '@xyflow/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  applyConnectFromPanelWhenTargetMeasured,
  createPanelConnectReactFlowAdapter,
  scheduleConnectFromPanelUntilMeasured,
} from './builderPanelConnectFlow'
import type { EdgeType } from './workflowToGraph'

const moveActivityBefore = vi.fn()

vi.mock('../../../stores/useWorkflowStore', () => ({
  useWorkflowStore: {
    getState: () => ({
      moveActivityBefore,
    }),
  },
}))

function invokeSetEdgesMock(
  setEdges: ReturnType<typeof vi.fn>,
  invoke: (updater: (edges: EdgeType[]) => EdgeType[]) => void
): void {
  const call = setEdges.mock.calls.at(-1)?.[0] as ((edges: EdgeType[]) => EdgeType[]) | undefined
  if (call) {
    invoke(call)
  }
}

describe('builderPanelConnectFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('createPanelConnectReactFlowAdapter delegates getNodes, setEdges, and setNodes', () => {
    const instance = {
      getNodes: vi.fn(() => [] as Node[]),
      setEdges: vi.fn((fn: (edges: EdgeType[]) => EdgeType[]) => fn([])),
      setNodes: vi.fn((fn: (nodes: Node[]) => Node[]) => fn([])),
    } as unknown as Pick<ReactFlowInstance, 'getNodes' | 'setEdges' | 'setNodes'>

    const adapter = createPanelConnectReactFlowAdapter(instance)
    adapter.getNodes()
    adapter.setEdges((eds) => eds)
    adapter.setNodes((nds) => nds)

    expect(instance.getNodes).toHaveBeenCalledOnce()
    expect(instance.setEdges).toHaveBeenCalledOnce()
    expect(instance.setNodes).toHaveBeenCalledOnce()
  })

  it('applyConnectFromPanelWhenTargetMeasured wires edges and nodes', () => {
    const setEdges = vi.fn()
    const setNodes = vi.fn()

    applyConnectFromPanelWhenTargetMeasured(
      { getNodes: () => [], setEdges, setNodes },
      {
        sourceId: 'source-1',
        targetId: 'target-1',
        capturedSourceHandle: undefined,
        capturedTargetHandle: undefined,
        capturedEdgeIdToReplace: undefined,
        capturedTargetNodeId: undefined,
        onAddNodeFromEdge: vi.fn(),
      }
    )

    expect(setEdges).toHaveBeenCalled()
    expect(setNodes).toHaveBeenCalled()

    invokeSetEdgesMock(setEdges, (updater) => {
      const next = updater([])
      expect(Array.isArray(next)).toBe(true)
    })
  })

  it('calls moveActivityBefore when replacing an edge between two targets', () => {
    const setEdges = vi.fn()
    const setNodes = vi.fn()

    applyConnectFromPanelWhenTargetMeasured(
      { getNodes: () => [], setEdges, setNodes },
      {
        sourceId: 'source-1',
        targetId: 'target-1',
        capturedSourceHandle: 'source',
        capturedTargetHandle: 'target',
        capturedEdgeIdToReplace: 'old-edge',
        capturedTargetNodeId: 'after-target',
        onAddNodeFromEdge: vi.fn(),
      }
    )

    expect(moveActivityBefore).toHaveBeenCalledWith('target-1', 'after-target')
  })

  it('scheduleConnectFromPanelUntilMeasured runs when target is already measured', () => {
    const setEdges = vi.fn()
    const setNodes = vi.fn()
    const measuredTarget = { id: 'target-1', measured: { width: 10, height: 10 } } as Node

    scheduleConnectFromPanelUntilMeasured(
      {
        getNodes: () => [measuredTarget],
        setEdges,
        setNodes,
      },
      {
        sourceId: 'source-1',
        targetId: 'target-1',
        capturedSourceHandle: undefined,
        capturedTargetHandle: undefined,
        capturedEdgeIdToReplace: undefined,
        capturedTargetNodeId: undefined,
        onAddNodeFromEdge: vi.fn(),
      }
    )

    expect(setEdges).toHaveBeenCalled()
    expect(setNodes).toHaveBeenCalled()
  })

  it('scheduleConnectFromPanelUntilMeasured returns a cancel that stops retries before target is measured', () => {
    vi.useFakeTimers()
    const setEdges = vi.fn()
    const setNodes = vi.fn()
    const unmeasuredTarget = { id: 'target-1' } as Node

    const cancel = scheduleConnectFromPanelUntilMeasured(
      {
        getNodes: () => [unmeasuredTarget],
        setEdges,
        setNodes,
      },
      {
        sourceId: 'source-1',
        targetId: 'target-1',
        capturedSourceHandle: undefined,
        capturedTargetHandle: undefined,
        capturedEdgeIdToReplace: undefined,
        capturedTargetNodeId: undefined,
        onAddNodeFromEdge: vi.fn(),
      }
    )

    expect(setEdges).not.toHaveBeenCalled()
    cancel()
    vi.runAllTimers()
    expect(setEdges).not.toHaveBeenCalled()
    expect(setNodes).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
