/**
 * Utility functions for filtering nodes and edges in the workflow builder.
 * Centralizes common filtering patterns to avoid code duplication.
 */

import type { NodeType } from '../../workflows/canvas/nodes/NodeType'

import type { EdgeType } from './workflowToGraph'

/**
 * Filters out placeholder and pending target nodes, returning only real workflow nodes
 */
export function filterRealNodes(nodes: NodeType[]): NodeType[] {
  return nodes.filter((node) => !node.id.startsWith('placeholder-') && !node.id.startsWith('pending-target-'))
}

/**
 * Checks if an edge is a button edge
 */
export function isButtonEdge(edge: EdgeType): boolean {
  return edge.type === 'buttonEdge' || edge.id.startsWith('button-')
}

/**
 * Checks if an edge is a real workflow edge (not a button edge or temporary pending edge).
 */
export function isRealEdge(edge: EdgeType): boolean {
  return !isButtonEdge(edge) && !edge.id.startsWith('pending-')
}

/**
 * Filters out button edges and temporary pending edges, returning only real workflow edges.
 */
export function filterRealEdges(edges: EdgeType[]): EdgeType[] {
  return edges.filter(isRealEdge)
}

/**
 * Filters to get only ButtonEdge edges
 */
export function filterButtonEdges(edges: EdgeType[]): EdgeType[] {
  return edges.filter(isButtonEdge)
}

/**
 * Filters to get only placeholder nodes
 */
export function filterPlaceholderNodes(nodes: NodeType[]): NodeType[] {
  return nodes.filter((node) => node.id.startsWith('placeholder-') || node.id.startsWith('pending-target-'))
}

/**
 * Checks if a node is a placeholder node
 */
export function isPlaceholderNode(node: NodeType): boolean {
  return node.id.startsWith('placeholder-') || node.id.startsWith('pending-target-')
}

/**
 * Checks if a node is a real workflow node (not a placeholder)
 */
export function isRealNode(node: NodeType): boolean {
  return !isPlaceholderNode(node)
}
