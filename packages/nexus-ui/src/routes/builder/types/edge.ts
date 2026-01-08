/**
 * Type definitions for workflow edge connections
 *
 * EdgeConnection is a simplified representation of edges used in the workflow store
 * and transformation logic. It strips away React Flow-specific properties.
 */
export interface EdgeConnection {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
}
