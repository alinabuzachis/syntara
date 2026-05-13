import { BUILTIN_AUTHENTICATED_GROUP_NAME } from '../adminConstants'

export function computeGroupCount(
  groupsData: { total?: number | null; resources?: { name: string }[] } | undefined
): number {
  const apiGroupCount = groupsData?.total ?? groupsData?.resources?.length ?? 0
  const hasAuthenticatedGroup = (groupsData?.resources ?? []).some((g) => g.name === BUILTIN_AUTHENTICATED_GROUP_NAME)
  return hasAuthenticatedGroup ? apiGroupCount : apiGroupCount + 1
}

export function computeRoleAssignmentCount(data: { total?: number | null; resources?: unknown[] }): number {
  if (data.total != null) return data.total
  if (data.resources) return data.resources.length
  return 0
}
