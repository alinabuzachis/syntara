import { safeJSONReviver } from './jsonSafeParse'

export function parseJsonEnvironment(raw: string | undefined): Record<string, string> | undefined {
  if (!raw) return undefined
  try {
    const parsed: unknown = JSON.parse(raw, safeJSONReviver)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
    const entries = Object.entries(parsed as Record<string, unknown>)
    if (!entries.every(([, v]) => typeof v === 'string')) return undefined
    return parsed as Record<string, string>
  } catch {
    return undefined
  }
}
