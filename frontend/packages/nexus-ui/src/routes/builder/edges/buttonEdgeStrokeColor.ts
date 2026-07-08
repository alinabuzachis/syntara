import { EdgeHandleEnum } from '@ansible/nexus-contracts'

import { DEFAULT_NEUTRAL_EDGE_STROKE } from '../../../constants/workflowEdgeStrokeTokens'

const APPROVED_EDGE_COLOR = 'var(--pf-t--global--color--status--success--default)'
const REJECTED_EDGE_COLOR = 'var(--pf-t--global--color--status--danger--default)'

/**
 * Default neutral stroke for workflow edges, arrow markers, canvas connection handles,
 * and button stub edges from non-approval handles (theme-aware).
 */
export const BUTTON_EDGE_DEFAULT_STROKE = DEFAULT_NEUTRAL_EDGE_STROKE

/** Brighter neutral for selected / hovered / active default edges and arrow marker graphics. */
export const CANVAS_EDGE_HIGHLIGHT_STROKE = 'var(--pf-t--global--color--nonstatus--gray--100)'

/**
 * Stroke color for button stub edges from approval node handles.
 */
export function getButtonEdgeStrokeColor(sourceHandle?: string | null): string {
  if (sourceHandle === EdgeHandleEnum.APPROVED) return APPROVED_EDGE_COLOR
  if (sourceHandle === EdgeHandleEnum.REJECTED) return REJECTED_EDGE_COLOR
  return BUTTON_EDGE_DEFAULT_STROKE
}
