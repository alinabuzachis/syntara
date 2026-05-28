import { useQueries } from '@tanstack/react-query'

import { accessFetchClient } from '../access/accessClient'

type AccessManagementPermissions = {
  canReadUsers: boolean
  canReadGroups: boolean
  isLoading: boolean
}

export function useAccessManagementPermissions(): AccessManagementPermissions {
  const [usersResult, groupsResult] = useQueries({
    queries: [
      {
        queryKey: ['authz', 'can_i', { action: 'read', resource_type: 'user' }],
        queryFn: () => accessFetchClient.POST('/authz/can_i', { body: { action: 'read', resource_type: 'user' } }),
        staleTime: Infinity,
        retry: false,
      },
      {
        queryKey: ['authz', 'can_i', { action: 'read', resource_type: 'group' }],
        queryFn: () => accessFetchClient.POST('/authz/can_i', { body: { action: 'read', resource_type: 'group' } }),
        staleTime: Infinity,
        retry: false,
      },
    ],
  })

  return {
    canReadUsers: usersResult.data?.data?.allowed !== false,
    canReadGroups: groupsResult.data?.data?.allowed !== false,
    isLoading: usersResult.isLoading || groupsResult.isLoading,
  }
}
