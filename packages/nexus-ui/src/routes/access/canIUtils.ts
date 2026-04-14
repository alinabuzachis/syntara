import type { PolicyRead } from './types'

export interface ResourceActionMap {
  resourceTypes: string[]
  actionsByResource: Map<string, string[]>
}

export function buildResourceActionMap(policies: PolicyRead[]): ResourceActionMap {
  const actionsByResource = new Map<string, Set<string>>()

  for (const policy of policies) {
    for (const stmt of policy.statements ?? []) {
      for (const actionStr of stmt.actions ?? []) {
        if (!actionStr.includes(':')) continue
        const [rtype, action] = actionStr.split(':', 2)
        if (!actionsByResource.has(rtype)) {
          actionsByResource.set(rtype, new Set())
        }
        actionsByResource.get(rtype)!.add(action)
      }
    }
  }

  const sorted = new Map<string, string[]>()
  for (const [rtype, actions] of [...actionsByResource.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    sorted.set(
      rtype,
      [...actions].sort((a, b) => a.localeCompare(b))
    )
  }

  return {
    resourceTypes: [...sorted.keys()],
    actionsByResource: sorted,
  }
}

/** Maps resource types to their list endpoints and display field.
 * Paths are relative to the accessFetchClient baseUrl (/api/v1/). */
export const RESOURCE_ENDPOINTS: Record<string, { path: string; idField: string; labelField: string }> = {
  workflow: { path: '/workflows', idField: 'id', labelField: 'name' },
  project: { path: '/projects', idField: 'id', labelField: 'name' },
  execution: { path: '/executions', idField: 'id', labelField: 'id' },
  policy: { path: '/policies', idField: 'id', labelField: 'name' },
  role: { path: '/roles', idField: 'id', labelField: 'name' },
  user: { path: '/users', idField: 'id', labelField: 'username' },
}

export interface ResourceOption {
  id: string
  label: string
}
