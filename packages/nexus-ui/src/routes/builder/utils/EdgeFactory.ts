import { addEdge } from '@xyflow/react'

import type { EdgeConnection } from '../types/edge'

import { markerEnd, type EdgeType } from './workflowToGraph'

// Re-export for convenience
export type { EdgeConnection, EdgeType }

export interface CreateEdgeOptions {
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  onAddNode?: (sourceId: string, targetId?: string, edgeId?: string, handle?: string) => void
}

/**
 * Centralized edge creation utility.
 *
 * This factory ensures consistent edge creation across:
 * - Manual connections (BuilderFlow.tsx)
 * - ButtonEdge automatic connections (BuilderContent.tsx)
 * - Edge insertions and replacements
 *
 * All edges created through this factory have:
 * - Consistent ID format
 * - Proper typing (EdgeType)
 * - Standard markerEnd styling
 * - Optional onAddNode callback in data
 */
export class EdgeFactory {
  /**
   * Creates a new edge with standard configuration.
   *
   * @param options - Edge creation options
   * @returns Properly typed and configured edge
   *
   * @example
   * ```typescript
   * const edge = EdgeFactory.createEdge({
   *   source: 'task-1',
   *   target: 'task-2',
   *   sourceHandle: 'source',
   *   targetHandle: 'target',
   *   onAddNode: handleAddNodeFromEdge
   * })
   * ```
   */
  static createEdge(options: CreateEdgeOptions): EdgeType {
    const { source, target, sourceHandle, targetHandle, onAddNode } = options

    // Generate edge ID based on sourceHandle
    const edgeId =
      sourceHandle && ['true', 'false'].includes(sourceHandle)
        ? `${source}-${sourceHandle}-${target}`
        : `${source}-${target}`

    return {
      id: edgeId,
      source,
      target,
      ...(sourceHandle ? { sourceHandle } : {}),
      targetHandle: targetHandle || 'target',
      type: 'default',
      markerEnd,
      ...(onAddNode ? { data: { onAddNode } } : {}),
    } as EdgeType
  }

  /**
   * Adds an edge to an existing edge array using React Flow's addEdge helper.
   *
   * This ensures proper edge deduplication and validation.
   *
   * @param edge - Edge to add
   * @param edges - Existing edges array
   * @returns Updated edges array
   *
   * @example
   * ```typescript
   * setEdges((eds) => EdgeFactory.addEdge(newEdge, eds))
   * ```
   */
  static addEdge(edge: EdgeType, edges: EdgeType[]): EdgeType[] {
    return addEdge(edge, edges as never) as EdgeType[]
  }

  /**
   * Creates and adds an edge in one operation.
   *
   * @param options - Edge creation options
   * @param edges - Existing edges array
   * @returns Updated edges array with new edge
   *
   * @example
   * ```typescript
   * setEdges((eds) => EdgeFactory.createAndAdd({
   *   source: 'task-1',
   *   target: 'task-2',
   *   onAddNode: handleAddNodeFromEdge
   * }, eds))
   * ```
   */
  static createAndAdd(options: CreateEdgeOptions, edges: EdgeType[]): EdgeType[] {
    const edge = this.createEdge(options)
    return this.addEdge(edge, edges)
  }

  /**
   * Replaces an edge by removing the old one and adding a new one.
   *
   * @param oldEdgeId - ID of edge to replace
   * @param options - New edge creation options
   * @param edges - Existing edges array
   * @returns Updated edges array
   *
   * @example
   * ```typescript
   * setEdges((eds) => EdgeFactory.replaceEdge('old-edge-id', {
   *   source: 'task-1',
   *   target: 'task-2'
   * }, eds))
   * ```
   */
  static replaceEdge(oldEdgeId: string, options: CreateEdgeOptions, edges: EdgeType[]): EdgeType[] {
    const filtered = edges.filter((e) => e.id !== oldEdgeId)
    return this.createAndAdd(options, filtered)
  }

  /**
   * Removes button edges for a specific node.
   *
   * Button edges have IDs in the format: `button-${nodeId}`
   *
   * @param nodeId - Node ID to remove button edges for
   * @param edges - Existing edges array
   * @returns Filtered edges array
   *
   * @example
   * ```typescript
   * setEdges((eds) => EdgeFactory.removeButtonEdge('task-1', eds))
   * ```
   */
  static removeButtonEdge(nodeId: string, edges: EdgeType[]): EdgeType[] {
    return edges.filter((e) => e.id !== `button-${nodeId}`)
  }

  /**
   * Converts EdgeType to EdgeConnection (for workflow store).
   *
   * @param edge - React Flow edge
   * @returns Simplified edge connection
   */
  static toEdgeConnection(edge: EdgeType): EdgeConnection {
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
    }
  }

  /**
   * Converts multiple EdgeTypes to EdgeConnections.
   *
   * @param edges - React Flow edges
   * @returns Array of edge connections
   */
  static toEdgeConnections(edges: EdgeType[]): EdgeConnection[] {
    return edges.map((e) => this.toEdgeConnection(e))
  }
}
