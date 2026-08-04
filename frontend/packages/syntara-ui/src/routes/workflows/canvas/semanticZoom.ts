/**
 * When the workflow canvas viewport zoom is at or below this scale, nodes render as
 * compact color blocks (similar to PatternFly Topology semantic zoom) with tooltips.
 */
export const SEMANTIC_ZOOM_MAX_SCALE = 0.5

/** Height of the solid color bar in flow coordinates when semantic zoom is active. */
export const SEMANTIC_ZOOM_BAR_HEIGHT_PX = 28

/**
 * Primary tooltip/canvas line for semantic zoom: non-empty trimmed `name`, or `whenEmpty`.
 * Use with a stable fallback such as `Untitled ${metadata.label}` so all activity nodes stay consistent.
 */
export function semanticZoomActivityTitle(name: string | undefined | null, whenEmpty: string): string {
  const trimmed = name?.trim()
  return trimmed ? trimmed : whenEmpty
}
