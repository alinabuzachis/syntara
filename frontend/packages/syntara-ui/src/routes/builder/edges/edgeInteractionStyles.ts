/**
 * Soft glow for selected / hovered / active workflow edges (SVG `filter`).
 * Uses PatternFly elevation shadow tokens (`--pf-t--global--box-shadow--color--sm--default` maps per
 * theme, including `pf-v6-theme-dark`) instead of a hardcoded white halo that disappears on light canvases.
 */
export const EDGE_INTERACTION_DROP_SHADOW =
  'drop-shadow(0 0 var(--pf-t--global--box-shadow--blur--100) var(--pf-t--global--box-shadow--color--sm--default))'
