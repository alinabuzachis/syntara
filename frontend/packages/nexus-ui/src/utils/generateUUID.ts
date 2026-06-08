import { v4 } from 'uuid'

export function generateUUID(): string {
  return v4()
}

export const generateActivityId = (prefix = 'activity') => `${prefix}_${generateUUID().replace(/-/g, '_')}`

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Validates that a string is a well-formed UUID (v1–v5, case-insensitive). */
export function isValidUUID(value: string): boolean {
  return UUID_RE.test(value)
}
