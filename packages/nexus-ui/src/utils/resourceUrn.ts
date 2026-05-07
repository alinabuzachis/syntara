import { AppRoute } from '../app/AppRoute'

const RESOURCE_TYPE_ROUTES: Record<string, (id: string) => string> = {
  workflow: (id) => AppRoute.WorkflowBuilder.Edit.replace(':workflowId', id),
  execution: (id) => AppRoute.Executions.Execution.replace(':executionId', id),
  credential: (id) => AppRoute.Configuration.Credentials.Detail.replace(':credentialId', id),
  user: (id) => AppRoute.AccessManagement.UserDetail.replace(':userId', id),
  group: (id) => AppRoute.AccessManagement.GroupDetail.replace(':groupId', id),
  project: (id) => AppRoute.AccessManagement.ProjectDetail.replace(':projectId', id),
}

export function parseResourceUrn(urn: string): { type: string; id: string; href: string | null } | null {
  const parts = urn.split(':')
  if (parts.length < 4 || parts[0] !== 'urn' || parts[1] !== 'nexus') return null

  const resourceType = parts[2]
  const idSegment = parts.slice(3).join(':')
  const idMatch = /^id=(.+)$/.exec(idSegment)
  const id = idMatch ? idMatch[1] : idSegment

  const routeBuilder = RESOURCE_TYPE_ROUTES[resourceType]
  return { type: resourceType, id, href: routeBuilder ? routeBuilder(id) : null }
}
