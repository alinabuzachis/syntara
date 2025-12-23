/**
 * Edge connection type for workflow graph edges.
 * Used throughout workflow transformation utilities.
 */
export interface EdgeConnection {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}
