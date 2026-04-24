/**
 * Presentation constants and user-visible copy for the masthead / shell project picker.
 * Keep logic comparisons out of `projectSelectorUx` — use internal keys in code instead.
 */

/**
 * No `--pf-t--global--*` width token exists for “select menu max width”.
 * PatternFly’s Menu component uses `18.75rem` for scrollable content max height
 * (`--pf-v6-c-menu--m-scrollable__content--MaxHeight` in `@patternfly/react-styles` menu.css),
 * which matches ~300px at a 16px root and scales with document font size.
 */
export const PROJECT_SELECTOR_MAX_WIDTH = '18.75rem'

export const projectSelectorUx = {
  allProjectsOptionLabel: 'All projects',
  allProjectsOptionDescription: 'View all items you have access to.',
  /** Shown on the toggle when `requireProject` is true and nothing is selected. */
  selectProjectPlaceholder: 'Select a project',
} as const
