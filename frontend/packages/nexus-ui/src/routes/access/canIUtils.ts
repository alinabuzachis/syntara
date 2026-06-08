export type ResourceActionMap = {
  resourceTypes: string[]
  actionsByResource: Map<string, string[]>
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

export type ResourceOption = {
  id: string
  label: string
}
