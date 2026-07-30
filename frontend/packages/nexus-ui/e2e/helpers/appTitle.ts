import { isExtendedEnvValue, resolveAppTitleFromEnv } from '../../src/utils/buildFlags'

/** Application title used in page-title assertions and login heading locators. */
export const APP_TITLE = resolveAppTitleFromEnv({
  extended: isExtendedEnvValue(process.env.VITE_EXTENDED),
  title: process.env.VITE_APP_TITLE,
})
