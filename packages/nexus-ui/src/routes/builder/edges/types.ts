/**
 * Type definitions for Builder Edge Components
 * Based on API schema specifications
 */

import type { Edge } from '@xyflow/react'

/**
 * Builder edge type with proper typing
 */
export type BuilderEdge = Edge<Record<string, unknown>>

/**
 * Edge type identifiers (only default as per API schema)
 */
export type EdgeTypeId = 'default'
