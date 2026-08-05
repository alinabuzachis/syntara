import headerDark from '../../assets/header-dark.svg'
import headerLight from '../../assets/header-light.svg'
import icon from '../../assets/icon.svg'
import { APP_TITLE } from '../../utils/appTitle'

import { logoLoginDark, logoLoginLight } from './loginBrandAssets'

export type BrandConfig = {
  appTitle: string
  faviconPath: string
  logoExpandedLight: string
  logoExpandedDark: string
  logoCollapsed: string
  logoLoginLight: string
  logoLoginDark: string
}

/**
 * Community (Syntara) defaults. Product builds override these by injecting
 * brand assets from a downstream overlay repo before `vite build`
 * (and optionally passing a `config` prop to `BrandProvider`).
 *
 * `index.html` already points at the community favicon (`icon.svg`); `BrandProvider`
 * still syncs `link[rel="icon"]` at runtime so a swapped `faviconPath` applies.
 */

export const defaultBrandConfig: BrandConfig = {
  appTitle: APP_TITLE,
  faviconPath: icon,
  logoExpandedLight: headerLight,
  logoExpandedDark: headerDark,
  logoCollapsed: icon,
  logoLoginLight,
  logoLoginDark,
}
