import headerDark from '../../assets/header-dark.svg'
import headerLight from '../../assets/header-light.svg'
import icon from '../../assets/icon.svg'
import { APP_TITLE } from '../../utils/appTitle'

import { logoLoginDark, logoLoginLight } from './loginBrandAssets'

export type ShellTheme = 'default' | 'felt'

export type BrandConfig = {
  appTitle: string
  faviconPath: string
  logoExpandedLight: string
  logoExpandedDark: string
  logoCollapsed: string
  logoLoginLight: string
  logoLoginDark: string
  shellTheme: ShellTheme
}

/**
 * Default brand config for this tree.
 *
 * `index.html` points at the community favicon (`icon.svg`); `BrandProvider`
 * syncs `link[rel="icon"]` at runtime when `faviconPath` changes.
 *
 * Shell background uses PatternFly glass themes on `<html>`:
 * - `'default'` → generic glass
 * - `'felt'` → Project Felt (`pf-v6-theme-felt`)
 */

export const defaultBrandConfig: BrandConfig = {
  appTitle: APP_TITLE,
  faviconPath: icon,
  logoExpandedLight: headerLight,
  logoExpandedDark: headerDark,
  logoCollapsed: icon,
  logoLoginLight,
  logoLoginDark,
  shellTheme: 'default',
}
