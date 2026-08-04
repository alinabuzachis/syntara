/**
 * Unified spacing constants for loop body positioning.
 * Shared between auto-layout (layoutEngine.ts) and manual positioning (useNodePositioning.ts).
 */
export const LOOP_BODY_SPACING = {
  horizontal: 80, // Space to the right of loop node (clears button edge)
  vertical: 100, // Space below loop node's top edge
  nodeGap: 40, // Spacing between consecutive body nodes
} as const
