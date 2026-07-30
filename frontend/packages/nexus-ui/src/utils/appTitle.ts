import { isExtendedMode } from './appMode'
import { resolveAppTitleFromEnv } from './buildFlags'

/** Resolve display title; gated by `VITE_EXTENDED` (see `buildFlags`). */
export function resolveAppTitle(
  extended: boolean = isExtendedMode(),
  title: string | undefined = import.meta.env.VITE_APP_TITLE as string | undefined
): string {
  return resolveAppTitleFromEnv({ extended, title })
}

export const APP_TITLE: string = resolveAppTitle()
