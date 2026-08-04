import { create } from 'zustand'

/**
 * Pinned mock data for a single node being edited.
 *
 * - inputMocks: per-predecessor mock output JSON (predecessorNodeId → JSON object)
 * - outputMock: mock output for the current node (used by downstream nodes)
 */
type PinnedMockData = {
  inputMocks: Record<string, Record<string, unknown>>
  outputMock: Record<string, unknown> | null
}

type MockDataState = {
  /** Keyed by the node being edited */
  pinnedData: Record<string, PinnedMockData>

  /**
   * Reference counts for output mocks (predecessorId → count)
   * Internal only — tracks how many nodes pin a given predecessor's output
   */
  refCounts: Record<string, number>

  pinInputMock: (nodeId: string, predecessorId: string, mockJson: Record<string, unknown>) => void
  unpinInputMock: (nodeId: string, predecessorId: string) => void
  unpinAllInputMocks: (nodeId: string) => void
  pinOutputMock: (nodeId: string, mockJson: Record<string, unknown>) => void
  unpinOutputMock: (nodeId: string) => void
  clearAllMocks: (nodeId: string) => void

  getInputMocks: (nodeId: string) => Record<string, Record<string, unknown>>
  getOutputMock: (nodeId: string) => Record<string, unknown> | null
  getInputMockCount: (nodeId: string) => number
  hasInputMock: (nodeId: string, predecessorId: string) => boolean
}

const emptyPinnedData: PinnedMockData = { inputMocks: {}, outputMock: null }

function getOrCreate(state: MockDataState, nodeId: string): PinnedMockData {
  return state.pinnedData[nodeId] ?? emptyPinnedData
}

export const useMockDataStore = create<MockDataState>()((set, get) => ({
  pinnedData: {},
  refCounts: {},

  /**
   * Bidirectional: pinning input mock for nodeB from nodeA also sets nodeA's outputMock
   * so downstream nodes can resolve it without re-fetching execution data
   */
  pinInputMock: (nodeId, predecessorId, mockJson) => {
    set((state) => {
      const updated = { ...state.pinnedData }
      const current = getOrCreate(state, nodeId)
      const newRefCounts = { ...state.refCounts }

      // Check if this is a new pin (not just updating existing mock data)
      const isNewPin = !current.inputMocks[predecessorId]

      updated[nodeId] = {
        ...current,
        inputMocks: { ...current.inputMocks, [predecessorId]: mockJson },
      }
      // Store as output mock on the predecessor so downstream nodes can resolve it
      if (!updated[predecessorId]) updated[predecessorId] = { inputMocks: {}, outputMock: null }
      updated[predecessorId] = { ...updated[predecessorId], outputMock: mockJson }

      // Only increment reference count for new pins
      if (isNewPin) {
        newRefCounts[predecessorId] = (newRefCounts[predecessorId] ?? 0) + 1
      }

      return { pinnedData: updated, refCounts: newRefCounts }
    })
  },

  unpinInputMock: (nodeId, predecessorId) => {
    set((state) => {
      const current = getOrCreate(state, nodeId)
      // Guard: don't mutate if this predecessor wasn't pinned
      if (!current.inputMocks[predecessorId]) return state

      const updated = { ...state.pinnedData }
      const remaining = { ...current.inputMocks }
      delete remaining[predecessorId]
      updated[nodeId] = { ...current, inputMocks: remaining }

      // Decrement reference count and clear outputMock when count reaches 0
      const newRefCounts = { ...state.refCounts }
      const currentCount = newRefCounts[predecessorId] ?? 0
      const newCount = Math.max(0, currentCount - 1)
      newRefCounts[predecessorId] = newCount

      if (newCount === 0 && updated[predecessorId]) {
        updated[predecessorId] = { ...updated[predecessorId], outputMock: null }
      }

      return { pinnedData: updated, refCounts: newRefCounts }
    })
  },

  unpinAllInputMocks: (nodeId) => {
    set((state) => {
      const updated = { ...state.pinnedData }
      const current = getOrCreate(state, nodeId)
      const predecessorIds = Object.keys(current.inputMocks)
      // Clear all input mocks for this node
      updated[nodeId] = { ...current, inputMocks: {} }

      // Decrement reference counts and clear outputMocks when count reaches 0
      const newRefCounts = { ...state.refCounts }
      for (const predecessorId of predecessorIds) {
        const currentCount = newRefCounts[predecessorId] ?? 0
        const newCount = Math.max(0, currentCount - 1)
        newRefCounts[predecessorId] = newCount

        if (newCount === 0 && updated[predecessorId]) {
          updated[predecessorId] = { ...updated[predecessorId], outputMock: null }
        }
      }

      return { pinnedData: updated, refCounts: newRefCounts }
    })
  },

  pinOutputMock: (nodeId, mockJson) => {
    set((state) => {
      const current = getOrCreate(state, nodeId)
      const newRefCounts = { ...state.refCounts }
      // Track ref count so unpinInputMock knows this output was explicitly pinned
      newRefCounts[nodeId] = (newRefCounts[nodeId] ?? 0) + 1
      return {
        pinnedData: {
          ...state.pinnedData,
          [nodeId]: { ...current, outputMock: mockJson },
        },
        refCounts: newRefCounts,
      }
    })
  },

  unpinOutputMock: (nodeId) => {
    set((state) => {
      const current = getOrCreate(state, nodeId)
      const newRefCounts = { ...state.refCounts }
      const currentCount = newRefCounts[nodeId] ?? 0
      newRefCounts[nodeId] = Math.max(0, currentCount - 1)
      return {
        pinnedData: {
          ...state.pinnedData,
          [nodeId]: { ...current, outputMock: null },
        },
        refCounts: newRefCounts,
      }
    })
  },

  clearAllMocks: (nodeId) => {
    set((state) => {
      const current = getOrCreate(state, nodeId)
      const predecessorIds = Object.keys(current.inputMocks)
      const remaining = { ...state.pinnedData }

      // Decrement reference counts for all pinned predecessors
      const newRefCounts = { ...state.refCounts }
      for (const predecessorId of predecessorIds) {
        const currentCount = newRefCounts[predecessorId] ?? 0
        const newCount = Math.max(0, currentCount - 1)
        newRefCounts[predecessorId] = newCount

        if (newCount === 0 && remaining[predecessorId]) {
          remaining[predecessorId] = { ...remaining[predecessorId], outputMock: null }
        }
      }

      delete remaining[nodeId]
      return { pinnedData: remaining, refCounts: newRefCounts }
    })
  },

  getInputMocks: (nodeId) => getOrCreate(get(), nodeId).inputMocks,
  getOutputMock: (nodeId) => getOrCreate(get(), nodeId).outputMock,
  getInputMockCount: (nodeId) => Object.keys(getOrCreate(get(), nodeId).inputMocks).length,
  hasInputMock: (nodeId, predecessorId) => predecessorId in getOrCreate(get(), nodeId).inputMocks,
}))
