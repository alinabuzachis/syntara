import { Position } from '@xyflow/react'

/**
 * Offset to align edge paths with handle position on source/right side.
 * Honestly I'm not sure why this is needed, but it is to prevent a gap between the handle and the edge.
 */
export const SOURCE_EDGE_OFFSET = 5

/**
 * Adjusts a coordinate based on position and offset.
 * For right/bottom positions, subtracts offset (moves inward).
 * For left/top positions, adds offset (moves inward).
 */
function adjustCoordinate(coordinate: number, position: Position, offset: number, isHorizontal: boolean): number {
  if (isHorizontal) {
    return position === Position.Right
      ? coordinate - offset
      : position === Position.Left
        ? coordinate + offset
        : coordinate
  } else {
    return position === Position.Bottom
      ? coordinate - offset
      : position === Position.Top
        ? coordinate + offset
        : coordinate
  }
}

/**
 * Adjusts source coordinates to account for handle position at visual edge.
 */
export function adjustSourceCoordinates(
  sourceX: number,
  sourceY: number,
  sourcePosition: Position,
  offset: number = SOURCE_EDGE_OFFSET
): { x: number; y: number } {
  return {
    x: adjustCoordinate(sourceX, sourcePosition, offset, true),
    y: adjustCoordinate(sourceY, sourcePosition, offset, false),
  }
}

export interface AdjustEdgeOptions {
  sourceX: number
  sourceY: number
  sourcePosition: Position
  targetX: number
  targetY: number
  offset?: number
}

/**
 * Adjusts both source and target coordinates.
 * Only source coordinates are currently adjusted (target handles don't need offset - they're positioned at edge).
 */
export function adjustEdgeCoordinates(options: AdjustEdgeOptions): {
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
} {
  const { sourceX, sourceY, sourcePosition, targetX, targetY, offset = SOURCE_EDGE_OFFSET } = options
  const adjustedSource = adjustSourceCoordinates(sourceX, sourceY, sourcePosition, offset)
  // Target handles are positioned at the edge without offset, so no adjustment needed
  return {
    sourceX: adjustedSource.x,
    sourceY: adjustedSource.y,
    targetX,
    targetY,
  }
}
