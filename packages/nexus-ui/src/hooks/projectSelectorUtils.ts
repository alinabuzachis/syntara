/**
 * Presentation constants and user-visible copy for the masthead / shell project picker.
 * Keep logic comparisons out of `projectSelectorUx` — use internal keys in code instead.
 */

/**
 * No `--pf-t--global--*` width token exists for "select menu max width".
 * PatternFly's scrollable menu content often uses ~`18.75rem`; we match that for width.
 * Using the same value for min and max keeps the toggle and dropdown at a stable width
 * regardless of selected project name length or filtered result set size.
 */
export const PROJECT_SELECTOR_WIDTH = '18.75rem'

/**
 * Max height for the scrollable project list only (not counting a sticky footer row like
 * "Create project"). Uses `min(40vh, 28rem)` so the menu:
 * - stays under 40% of the viewport on short displays (never dominates the page), and
 * - caps at ~448px (28rem) on tall displays so it does not balloon unnecessarily.
 * Scales with root font size via the rem leg; the vh leg handles small windows.
 */
export const PROJECT_SELECTOR_LIST_MAX_HEIGHT = 'min(40vh, 28rem)'

export const projectSelectorUx = {
  /** Shown inline before the typeahead value in the masthead toggle. */
  togglePrefixLabel: 'Project:',
  allProjectsOptionLabel: 'All projects',
  allProjectsOptionDescription: 'View all items you have access to.',
  /** Shown on the toggle when `requireProject` is true and nothing is selected. */
  selectProjectPlaceholder: 'Select a project',
  /** Select group: starred projects (subset of current results), also listed under Projects. */
  favoritesGroupLabel: 'Favorites',
  /** Select group: full project list for the current typeahead / page (includes favorites). */
  projectsGroupLabel: 'Projects',
} as const
