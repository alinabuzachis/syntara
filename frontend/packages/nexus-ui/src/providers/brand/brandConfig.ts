import syntaraHeaderDark from '../../assets/syntara-header-dark.svg'
import syntaraHeaderLight from '../../assets/syntara-header-light.svg'
import syntaraIcon from '../../assets/syntara-icon.svg'
import syntaraLogin from '../../assets/syntara-login.svg'
import { APP_TITLE } from '../../utils/appTitle'

export type BrandConfig = {
  appTitle: string
  faviconPath: string
  logoExpandedLight: string
  logoExpandedDark: string
  logoCollapsed: string
  logoLogin: string
}

/**
 * Community (Syntara) defaults. Product builds override these by injecting
 * brand assets from a downstream overlay repo before `vite build`
 * (and optionally passing a `config` prop to `BrandProvider`).
 *
 * `index.html` already points at the Syntara favicon for community; `BrandProvider`
 * still syncs `link[rel="icon"]` at runtime so a swapped `faviconPath` applies.
 */
export const defaultBrandConfig: BrandConfig = {
  appTitle: APP_TITLE,
  faviconPath: syntaraIcon,
  logoExpandedLight: syntaraHeaderLight,
  logoExpandedDark: syntaraHeaderDark,
  logoCollapsed: syntaraIcon,
  logoLogin: syntaraLogin,
}
