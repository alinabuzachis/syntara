import { edgeTypes } from '../workflows/canvas/edges/EdgeType'
import { nodeTypes } from '../workflows/canvas/nodes/NodeType'

import { ButtonEdge } from './edges/ButtonEdge'
import { DefaultEdge } from './edges/DefaultEdge'
import { LoopBackEdge } from './edges/LoopBackEdge'
import { LoopDoneEdge } from './edges/LoopDoneEdge'
import { LoopOutgoingEdge } from './edges/LoopOutgoingEdge'
import { PlaceholderNode } from './nodes/PlaceholderNode'

export const builderNodeTypes = {
  ...nodeTypes,
  placeholder: PlaceholderNode,
}

export const builderEdgeTypes = {
  ...edgeTypes,
  default: DefaultEdge,
  buttonEdge: ButtonEdge,
  loopBack: LoopBackEdge,
  loopDone: LoopDoneEdge,
  loopOutgoing: LoopOutgoingEdge,
}

export const resolveExecutionStatus = (rest?: string | null, store?: string | null): string | null => {
  if (rest === null) return null
  return store ?? rest ?? null
}
