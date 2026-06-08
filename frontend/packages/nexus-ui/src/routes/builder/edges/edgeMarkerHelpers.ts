/**
 * Helper function to determine the effective marker ID based on edge state.
 */
export function getEffectiveMarkerEnd(
  selected: boolean | undefined,
  isEdgeHovered: boolean,
  isActive: boolean | undefined,
  defaultMarkerEnd: string | undefined
): string | undefined {
  if (selected) {
    return "url('#selected-arrow-marker')"
  }
  if (isEdgeHovered || isActive) {
    return "url('#hover-arrow-marker')"
  }
  return defaultMarkerEnd
}
