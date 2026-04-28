import { accessClient } from '../routes/access/accessClient'
import { BUILTIN_ADMINS_GROUP_NAME } from '../routes/access-management/adminConstants'

/**
 * Returns the number of enabled users in the built-in admins group.
 * Used to determine whether the built-in admin account can be disabled.
 *
 * Pass `enabled: false` to skip the query when the result is not needed.
 */
export function useActiveAdminCount(enabled = true): number {
  // Filter by name server-side so the built-in admins group is always in the first page
  const groupsQuery = accessClient.useQuery(
    'get',
    '/groups',
    { params: { query: { limit: 100, name: BUILTIN_ADMINS_GROUP_NAME } } },
    { enabled }
  )
  const adminsGroup = (groupsQuery.data?.resources ?? []).find((g) => g.is_builtin)
  const adminsGroupId = adminsGroup?.id ?? ''

  const membersQuery = accessClient.useQuery(
    'get',
    '/groups/{group_id}/members',
    { params: { path: { group_id: adminsGroupId }, query: { limit: 100 } } },
    { enabled: enabled && !!adminsGroupId }
  )

  const members = membersQuery.data?.resources ?? []

  // Safety: if the response is exactly at the limit, the count may be truncated.
  // In that case, report a high count so the "last admin" guard stays conservative
  // (i.e. never incorrectly prevents disabling when there are more admins).
  if (members.length === 100) {
    return members.length
  }

  return members.filter((m) => m.is_enabled).length
}
