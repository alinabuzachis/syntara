import { Panel, PanelMain, PanelMainBody, type PanelProps } from '@patternfly/react-core'
import type { ComponentProps, CSSProperties, ReactNode } from 'react'
import { forwardRef } from 'react'

/** Solid panel fill under glass theme without `variant="raised"` chrome (shadow / smaller radius). */
const OPAQUE_FLOATING_PANEL_FILL_STYLE = {
  '--pf-v6-c-panel--BackgroundColor': 'var(--pf-t--global--background--color--floating--default)',
} as CSSProperties

type PanelMainProps = Omit<ComponentProps<typeof PanelMain>, 'children'>
type PanelMainBodyProps = Omit<ComponentProps<typeof PanelMainBody>, 'children'>

/**
 * Convenience wrapper around `Panel -> PanelMain -> PanelMainBody` per the PatternFly
 * [panel composition spec](https://github.com/patternfly/patternfly-react/pull/12372).
 *
 * Inherited prop overrides: `isGlass` defaults **on** unless `isGlass={false}`, `isPill`, or
 * `variant="raised"` is set. `isScrollable + isFullHeight` auto-enables `isAutoHeight` (pass
 * `isAutoHeight={false}` to opt out). Avoid `overflow: hidden` between sibling `variant="raised"`
 * panels - it clips the box-shadow; use `NxPageBody` / `minHeight: 0` instead.
 */
export type NxPanelProps = Omit<PanelProps, 'children'> & {
  /** Rendered inside `PanelMainBody`. */
  children?: ReactNode
  /** Removes padding from `PanelMainBody`. */
  hasNoPadding?: boolean
  /**
   * Solid floating-token fill (opaque under `pf-v6-theme-glass`) without `variant="raised"` chrome.
   * Prefer `variant="raised"` when you want the full raised look (shadow + smaller radius).
   */
  opaqueFloatingFill?: boolean
  /** Props forwarded to the inner `PanelMain` element. */
  panelMainProps?: PanelMainProps
  /** Props forwarded to the inner `PanelMainBody` element. */
  panelMainBodyProps?: Omit<PanelMainBodyProps, 'children'>
}

function defaultIsGlass(
  isPill: boolean | undefined,
  variant: PanelProps['variant'],
  isGlass: boolean | undefined
): boolean {
  if (isGlass === true) return true
  if (isGlass === false || isPill === true || variant === 'raised') return false
  return true
}

export const NxPanel = forwardRef<HTMLDivElement, NxPanelProps>(function NxPanel(
  {
    hasNoPadding,
    children,
    panelMainProps,
    panelMainBodyProps,
    isScrollable,
    isFullHeight,
    isAutoHeight,
    style: panelStyle,
    className,
    isPill,
    variant,
    isGlass,
    opaqueFloatingFill,
    ...panelProps
  },
  ref
) {
  const { style: mainStyle, ...restPanelMain } = panelMainProps ?? {}
  const { style: bodyStyle, className: bodyClassName, ...restBody } = panelMainBodyProps ?? {}

  let mergedBodyStyle: CSSProperties = { ...bodyStyle }
  if (hasNoPadding === true) {
    mergedBodyStyle = { ...mergedBodyStyle, padding: 0 }
  }
  if (isFullHeight === true) {
    mergedBodyStyle = {
      flex: 1,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      ...mergedBodyStyle,
    }
  }
  const bodyStyleProp = Object.keys(mergedBodyStyle).length > 0 ? mergedBodyStyle : undefined

  let mergedMainStyle: CSSProperties = { ...mainStyle }
  if (isFullHeight === true) {
    mergedMainStyle = { flex: 1, minHeight: 0, ...mergedMainStyle }
  }
  const mainStyleProp = Object.keys(mergedMainStyle).length > 0 ? mergedMainStyle : undefined

  const useAutoHeight =
    isAutoHeight === true || (isAutoHeight !== false && isScrollable === true && isFullHeight === true)

  const mergedPanelStyle: CSSProperties = {
    ...(isFullHeight === true ? { flex: 1, minHeight: 0, minWidth: 0 } : {}),
    ...(opaqueFloatingFill === true ? OPAQUE_FLOATING_PANEL_FILL_STYLE : {}),
    ...panelStyle,
  }
  const panelStyleProp = Object.keys(mergedPanelStyle).length > 0 ? mergedPanelStyle : undefined

  return (
    <Panel
      ref={ref}
      className={className}
      style={panelStyleProp}
      isScrollable={isScrollable}
      isFullHeight={isFullHeight}
      isAutoHeight={useAutoHeight ? true : undefined}
      isPill={isPill}
      variant={variant}
      {...panelProps}
      isGlass={defaultIsGlass(isPill, variant, isGlass)}
    >
      <PanelMain {...restPanelMain} style={mainStyleProp}>
        <PanelMainBody {...restBody} className={bodyClassName} style={bodyStyleProp}>
          {children}
        </PanelMainBody>
      </PanelMain>
    </Panel>
  )
})

NxPanel.displayName = 'NxPanel'
