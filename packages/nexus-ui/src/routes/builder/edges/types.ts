import type { EdgeProps } from '@xyflow/react'

/**
 * Shared edge data interface used by all edge types
 */
export interface EdgeData {
  onAddNode?: (sourceNodeId: string, targetNodeId: string, edgeId: string, sourceHandle?: string) => void
  isActive?: boolean
  isPending?: boolean
}

/**
 * Button edge data interface (different from regular edges)
 */
export interface ButtonEdgeData {
  onButtonClick?: () => void
  isActive?: boolean
  sourceHandle?: string
}

/**
 * Base edge props interface that all edge components extend
 */
export interface BaseEdgeProps extends Omit<EdgeProps, 'data'> {
  data?: EdgeData
}

/**
 * Button edge props interface
 */
export interface ButtonEdgeProps extends Omit<EdgeProps, 'data'> {
  data?: ButtonEdgeData
}
