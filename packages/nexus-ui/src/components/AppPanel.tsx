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
 * `Panel` → `PanelMain` → `PanelMainBody` per PatternFly
 * [patternfly-react#12372](https://github.com/patternfly/patternfly-react/pull/12372).
 *
 * - **`hasNoPadding`** — `padding: 0` on `PanelMainBody`.
 * - **`isGlass`** — defaults **on** when `pf-v6-theme-glass` is on `<html>` (`index.html`), unless
 *   `isGlass={false}`, **`isPill`**, or **`variant="raised"`**.
 * - **`opaqueFloatingFill`** — with the glass theme, the default primary fill stays translucent even when
 *   `isGlass={false}`; set **`opaqueFloatingFill`** for a solid floating-token fill without **`variant="raised"`**
 *   chrome. Prefer **`variant="raised"`** when you want PatternFly’s raised panel look (opaque + shadow).
 * - **`isFullHeight`** — flex stretch on the root `Panel` and `PanelMain` / `PanelMainBody` so
 *   `height: '100%'` children (e.g. React Flow) resolve.
 * - **`isScrollable` + `isFullHeight`** — defaults **`isAutoHeight`** (avoids PF’s short scroll cap);
 *   pass **`isAutoHeight={false}`** to opt out.
 * - Do not nest another `PanelMain` / `PanelMainBody` inside; use **`panelMainProps`** /
 *   **`panelMainBodyProps`**.
 * - Avoid **`overflow: hidden`** between sibling **`variant="raised"`** panels (clips raised
 *   **`box-shadow`**); use **`AppPageMain`** / **`minHeight: 0`** on scroll regions instead.
 */
export type AppPanelProps = Omit<PanelProps, 'children'> & {
  children?: ReactNode
  /** Zero padding on `PanelMainBody` */
  hasNoPadding?: boolean
  /**
   * Solid background using PatternFly’s floating surface token (opaque under `pf-v6-theme-glass`).
   * Use for large flat shells where `variant="raised"` would be the wrong chrome; merges before `style`
   * so callers can override.
   */
  opaqueFloatingFill?: boolean
  panelMainProps?: PanelMainProps
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

export const AppPanel = forwardRef<HTMLDivElement, AppPanelProps>(function AppPanel(
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

AppPanel.displayName = 'AppPanel'
