export type MembershipSourceInfo = {
  type: string
  provider_name?: string | null
}

function isMembershipSourceInfo(value: unknown): value is MembershipSourceInfo {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof (value as Record<string, unknown>).type === 'string'
  )
}

export function getMembershipSources(value: object): MembershipSourceInfo[] | undefined {
  if ('membership_sources' in value && Array.isArray((value as Record<string, unknown>).membership_sources)) {
    const arr = (value as Record<string, unknown>).membership_sources as unknown[]
    if (arr.every(isMembershipSourceInfo)) return arr
  }
  return undefined
}
