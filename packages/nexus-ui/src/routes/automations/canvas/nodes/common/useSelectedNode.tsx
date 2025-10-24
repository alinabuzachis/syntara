import type { Node } from '@xyflow/react'
import { useStore } from '@xyflow/react'
import { shallow } from 'zustand/shallow'

// A selector that returns *only* the selected nodes
const selectedNodesSelector = (state: { nodes: Node[] }) => state.nodes.filter((node) => node.selected)

export function useSelectedNodes() {
  // By using 'shallow', this component *only* re-renders if
  // the contents of the selectedNodes array change.
  return useStore(selectedNodesSelector, shallow)
}
