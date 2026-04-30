import { Stack, type StackProps } from '@patternfly/react-core'
import type { CSSProperties } from 'react'

import {
  panelContentStackCredentialDetailTabStyle,
  panelContentStackPageGutterStyle,
  panelContentStackStyle,
} from '../app/panelContentStackStyle'

const VARIANT_STYLE = {
  default: panelContentStackStyle,
  pageGutter: panelContentStackPageGutterStyle,
  credentialDetailTab: panelContentStackCredentialDetailTabStyle,
} as const satisfies Record<string, CSSProperties>

export type PanelContentStackVariant = keyof typeof VARIANT_STYLE

export type PanelContentStackProps = StackProps & {
  /** Preset layout; merged before `style`. */
  variant?: PanelContentStackVariant
}

/**
 * `Stack` preconfigured with `panelContentStackStyle` for `AppPanel isFullHeight` main columns.
 * Prefer this over repeating the same `style` spread across routes (reduces Sonar duplication).
 */
export function PanelContentStack({ variant = 'default', style, ...props }: PanelContentStackProps) {
  const base = VARIANT_STYLE[variant]
  const mergedStyle: CSSProperties = { ...base, ...style }
  return <Stack style={mergedStyle} {...props} />
}
