export const SWITCH_CASE_PORT_PREFIX = 'case_'

export function buildSwitchCasePort(index: number): string {
  return `${SWITCH_CASE_PORT_PREFIX}${index}`
}

export function isSwitchCasePort(handle: string | undefined | null): boolean {
  return typeof handle === 'string' && handle.startsWith(SWITCH_CASE_PORT_PREFIX)
}
