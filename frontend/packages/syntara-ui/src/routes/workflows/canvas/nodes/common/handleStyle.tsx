import type { CSSProperties } from 'react'

import { DEFAULT_NEUTRAL_EDGE_STROKE } from '../../../../../constants/workflowEdgeStrokeTokens'

/**
 * Solid handles using the same neutral stroke token as default workflow edges and
 * arrow markers (no border/outline — avoids mismatched chrome between target vs source).
 */
const handleFill = DEFAULT_NEUTRAL_EDGE_STROKE

/** Style for target (input) handles: thin vertical bar, crosshair cursor. */
export const targetHandleStyle: CSSProperties = {
  width: 2,
  height: 16,
  borderRadius: 0,
  background: handleFill,
  border: 'none',
  cursor: 'crosshair',
}

/** Style for source (output) handles: circular knob, crosshair cursor. */
export const sourceHandleStyle: CSSProperties = {
  width: 12,
  height: 12,
  borderRadius: '50%',
  background: handleFill,
  border: 'none',
  boxSizing: 'border-box',
  cursor: 'crosshair',
}
