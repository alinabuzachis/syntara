import type { CSSProperties } from 'react'

/**
 * Layout style objects for full-height panel content.
 *
 * - **PanelContentStack** composes `panelContentStackStyle` and the `panelContentStack*Style` variants
 *   (see `PanelContentStack.tsx`) — prefer that component for those presets.
 * - **Standalone exports** (`stackPaddingLgOnlyStyle`, `scrollableTableShellStackStyle`, etc.) are for
 *   call sites that need a raw `style` object without the wrapper.
 *
 * PatternFly `Stack` props for the main content column inside `AppPanel` with `isFullHeight`.
 * `height: '100%'` alone often fails to fill a flex parent; `flex: 1` + `minHeight: 0` opts into
 * correct flex shrink/growth so nested `ScrollableTableContainer` / scroll regions get a real height.
 */
export const panelContentStackStyle = {
  height: '100%',
  flex: 1,
  minHeight: 0,
  minWidth: 0,
} as const satisfies CSSProperties

/** List pages that use horizontal inset matching workflows / executions / approvals. */
export const panelContentStackPageGutterStyle = {
  ...panelContentStackStyle,
  padding: '0 var(--pf-t--global--spacer--sm)',
} as const satisfies CSSProperties

/** Credential detail “workflows” tab: fill panel with lg padding. */
export const panelContentStackCredentialDetailTabStyle = {
  ...panelContentStackStyle,
  padding: 'var(--pf-t--global--spacer--lg)',
} as const satisfies CSSProperties

/** Loading / empty sections in credential workflows tab (padded `Stack`, not full panel fill). */
export const stackPaddingLgOnlyStyle = {
  padding: 'var(--pf-t--global--spacer--lg)',
} as const satisfies CSSProperties

/** Inner column inside `ScrollableTableContainer` (clip + bounded height). */
export const scrollableTableShellStackStyle = {
  ...panelContentStackStyle,
  maxHeight: '100%',
  overflow: 'hidden',
  width: '100%',
} as const satisfies CSSProperties
