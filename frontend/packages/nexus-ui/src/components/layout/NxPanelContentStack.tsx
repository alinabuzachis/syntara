import { Stack, type StackProps } from '@patternfly/react-core'
import type { CSSProperties } from 'react'

import { panelContentStackInsetStyle, panelContentStackStyle } from '../../app/panelContentStackStyle'

const VARIANT_STYLE = {
  /**
   * Full-height flex sizing with no additional padding. Use inside tab-based detail panels
   * (access management, configuration) where the tab chrome already provides inset.
   */
  default: panelContentStackStyle,
  /**
   * Adds a small horizontal inset (`padding: 0 --pf-t--global--spacer--sm`). Use on top-level
   * list pages (Workflows, Executions, Approvals, Integrations) where the filter bar and table
   * sit directly against the panel edge with no surrounding tab structure.
   */
  inset: panelContentStackInsetStyle,
} as const satisfies Record<string, CSSProperties>

export type NxPanelContentStackVariant = keyof typeof VARIANT_STYLE

export type NxPanelContentStackProps = StackProps & {
  /** Layout preset; merged before any `style` override. Defaults to `"default"`. */
  variant?: NxPanelContentStackVariant
}

/**
 * `Stack` preconfigured with full-height flex sizing for use inside `NxPanel isFullHeight`.
 *
 * Sets `flex: 1`, `minHeight: 0`, and `height: 100%` so that nested `NxScrollableTableContainer`
 * regions get a real bounded height — `height: 100%` alone fails inside a flex parent.
 */
export function NxPanelContentStack({ variant = 'default', style, ...props }: NxPanelContentStackProps) {
  const mergedStyle: CSSProperties = { ...VARIANT_STYLE[variant], ...style }

  return <Stack style={mergedStyle} {...props} />
}
