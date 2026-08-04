// Distinct named export so builderEdgeTypes has a consistent 1:1 mapping for every edge type key.
// Behavior is identical to DefaultEdge; this file exists to keep the registry uniform.
export { DefaultEdge as LoopOutgoingEdge } from './DefaultEdge'
