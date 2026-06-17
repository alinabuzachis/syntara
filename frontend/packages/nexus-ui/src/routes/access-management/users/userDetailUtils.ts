export function computeGroupCount(
  groupsData: { total?: number | null; resources?: { name: string }[] } | undefined
): number {
  return groupsData?.total ?? groupsData?.resources?.length ?? 0
}

export function computeRoleAssignmentCount(data: { total?: number | null; resources?: unknown[] }): number {
  if (data.total != null) return data.total
  if (data.resources) return data.resources.length
  return 0
}
