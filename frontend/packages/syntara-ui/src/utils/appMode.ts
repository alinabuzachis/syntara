import { isExtendedEnvValue } from './buildFlags'

export type AppMode = 'community' | 'extended'

/**
 * Extended builds set `VITE_EXTENDED=true` (or `1`).
 * Unset / anything else → community (safe default for upstream).
 * Same gate as title + docs overlays — do not add a second mode env var.
 * Legacy `VITE_DOC_MODE` / `VITE_APP_MODE` are ignored (see `.env.example`).
 */
function isExtendedFromEnv(): boolean {
  return isExtendedEnvValue(import.meta.env.VITE_EXTENDED)
}

export function resolveAppMode(): AppMode {
  return isExtendedFromEnv() ? 'extended' : 'community'
}

/** Prefer this over comparing mode strings at call sites. */
export function isCommunityMode(mode: AppMode = resolveAppMode()): boolean {
  return mode === 'community'
}

/** True when mode is explicitly extended/product. */
export function isExtendedMode(mode: AppMode = resolveAppMode()): boolean {
  return mode === 'extended'
}
