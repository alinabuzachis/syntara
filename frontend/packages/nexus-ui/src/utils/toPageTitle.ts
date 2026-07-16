import { APP_TITLE } from './appTitle'

export function toPageTitle(segments: (string | null | undefined)[]): string {
  const cleaned = segments.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim())
  return [...cleaned, APP_TITLE].join(' | ')
}
