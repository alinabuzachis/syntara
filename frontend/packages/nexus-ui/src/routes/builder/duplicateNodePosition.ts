import type { Node } from '@xyflow/react'

import type { FlowPosition } from './types'

const DUPLICATE_GAP = 120
const DUPLICATE_COLLISION_PADDING = 20
const DEFAULT_NODE_WIDTH = 300
const DEFAULT_NODE_HEIGHT = 60

/**
 * Returns the top-left position where a duplicated node can be placed without
 * overlapping any existing node.
 *
 * Strategy:
 * 1. Scan rightward from preferredX across up to 10 rows, skipping over any
 *    blocking node's right edge on each row.
 * 2. If every row is fully blocked (extremely unlikely), fall back to a position
 *    beyond the rightmost edge of all nodes — which is mathematically guaranteed
 *    to be free because no existing node's right edge can reach that x coordinate.
 */
export function findDuplicatePosition(originalNode: Node, allNodes: Node[]): FlowPosition {
  const origWidth = originalNode.measured?.width ?? DEFAULT_NODE_WIDTH
  const origHeight = originalNode.measured?.height ?? DEFAULT_NODE_HEIGHT
  const measuredNodes = allNodes.filter(
    (n) => n.id !== originalNode.id && typeof n.measured === 'object' && n.measured !== null
  )

  function getBlocker(x: number, y: number): Node | null {
    return (
      measuredNodes.find((node) => {
        const nw = node.measured?.width ?? DEFAULT_NODE_WIDTH
        const nh = node.measured?.height ?? DEFAULT_NODE_HEIGHT
        const p = DUPLICATE_COLLISION_PADDING
        return !(
          x + origWidth + p <= node.position.x ||
          node.position.x + nw + p <= x ||
          y + origHeight + p <= node.position.y ||
          node.position.y + nh + p <= y
        )
      }) ?? null
    )
  }

  /** Scan rightward from `startX` at a fixed `y`, skipping over blockers. */
  function scanForSlot(startX: number, y: number): FlowPosition | null {
    let x = startX
    for (let attempt = 0; attempt < 20; attempt++) {
      const blocker = getBlocker(x, y)
      if (!blocker) return { x, y }
      x = blocker.position.x + (blocker.measured?.width ?? DEFAULT_NODE_WIDTH) + DUPLICATE_GAP
    }
    return null
  }

  const preferredX = originalNode.position.x + origWidth + DUPLICATE_GAP

  for (let row = 0; row < 10; row++) {
    const y = originalNode.position.y + row * (origHeight + DUPLICATE_GAP)
    const slot = scanForSlot(preferredX, y)
    if (slot) return slot
  }

  const rightmostX = measuredNodes.reduce(
    (max, n) => Math.max(max, n.position.x + (n.measured?.width ?? DEFAULT_NODE_WIDTH) + DUPLICATE_GAP),
    preferredX
  )
  return { x: rightmostX, y: originalNode.position.y }
}
