import { useAllGroups } from '../../access/useAllGroups'

/**
 * Hook to get groups for approval approvers.
 *
 * MVP: Returns all groups without permission filtering.
 * Backend validates group membership at decision time.
 *
 * KNOWN LIMITATION: Users can select groups with no approval:decide members,
 * creating unapproachable approvals that hang forever. The helper text warns
 * about this, but there's no runtime check or visual indicator.
 *
 * Follow-up improvements:
 * 1. Backend: Add `member_count` or `has_decide_permission` flag to Group API response
 * 2. UI: Show warning badge on groups with zero eligible members
 * 3. Long-term: Implement /authz/which_groups_can endpoint for proper filtering
 *
 * Rationale for not filtering in MVP:
 * - The /authz/who_can endpoint returns users, not groups
 * - Client-side filtering would require N×M API calls (N groups × M members), causing poor performance
 * - Backend filtering requires new endpoint or additional fields on existing endpoint
 *
 * See PR #895 review comment: https://github.com/syntara-orchestration/syntara-ui/pull/895
 *
 * @returns Object containing groups array, loading state, and error
 */
export function useApprovalDecideGroups() {
  const { groups, isLoading, error } = useAllGroups()

  return {
    groups,
    isLoading,
    error,
  }
}
