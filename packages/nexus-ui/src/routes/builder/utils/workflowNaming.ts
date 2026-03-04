/** Default workflow name used for new workflows. Export for use in UI and tests. */
export const DEFAULT_WORKFLOW_NAME = 'new-workflow'

/**
 * Returns the next available default workflow name given existing workflows or names.
 * Accepts either an array of workflow-like objects (with .name) or an array of name strings.
 * Do not mix both in the same array.
 * Uses DEFAULT_WORKFLOW_NAME if not taken, otherwise appends "-1", "-2", etc.
 */
export function getNextDefaultWorkflowName(existing: string[] | Array<{ name?: string | null }>): string {
  const names: string[] =
    existing.length > 0 && typeof existing[0] === 'string'
      ? (existing as string[]).filter(Boolean)
      : ((existing as Array<{ name?: string | null }>).map((w) => w.name).filter(Boolean) as string[])
  const used = new Set(names)
  if (!used.has(DEFAULT_WORKFLOW_NAME)) {
    return DEFAULT_WORKFLOW_NAME
  }
  let n = 1
  while (used.has(`${DEFAULT_WORKFLOW_NAME}-${n}`)) {
    n += 1
  }
  return `${DEFAULT_WORKFLOW_NAME}-${n}`
}
