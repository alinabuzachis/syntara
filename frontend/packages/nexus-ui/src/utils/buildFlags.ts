/** Shared build-flag helpers (Node + browser). Gate community vs extended on one env var. */

import { z } from 'zod'

const COMMUNITY_APP_TITLE = 'Syntara'

const extendedFlagSchema = z.union([z.literal('true'), z.literal('1')])

/** Extended builds set `VITE_EXTENDED=true` or `1`. Anything else → community. */
export function isExtendedEnvValue(raw: unknown): boolean {
  return extendedFlagSchema.safeParse(raw).success
}

/**
 * Title string is only honored on extended builds.
 * Community always uses the community title, even if `VITE_APP_TITLE` is set.
 */
export function resolveAppTitleFromEnv(options: { extended: boolean; title?: string }): string {
  if (!options.extended) {
    return COMMUNITY_APP_TITLE
  }
  const title = options.title?.trim()
  return title || COMMUNITY_APP_TITLE
}
