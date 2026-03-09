import type { EdgeProps } from '@xyflow/react'

import type { FlowPosition } from '../types'

/**
 * Shared edge data interface used by all edge types
 */
export interface EdgeData {
  onAddNode?: (sourceNodeId: string, targetNodeId: string, edgeId: string, sourceHandle?: string) => void
  isActive?: boolean
  isPending?: boolean
  executionStatus?: 'passed' | 'pending'
}

/**
 * Button edge data interface (different from regular edges)
 */
export interface ButtonEdgeData {
  /** Called when [+] is clicked; optional position is the [+] location in flow coordinates (for placing the new node) */
  onButtonClick?: (position?: FlowPosition) => void
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
