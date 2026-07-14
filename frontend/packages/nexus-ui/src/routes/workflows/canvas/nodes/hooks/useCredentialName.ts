import { credentialsClient } from '../../../../../client'

/**
 * Resolve a credential UUID to its display name.
 * Fetches the individual credential by ID via /credentials/{credential_id}.
 */
export function useCredentialName(credentialId: string | undefined): { name: string | undefined; isPending: boolean } {
  const { data, isPending } = credentialsClient.useQuery(
    'get',
    '/credentials/{credential_id}',
    { params: { path: { credential_id: credentialId ?? '' } } },
    { enabled: !!credentialId, staleTime: 5 * 60 * 1000 }
  )

  return { name: data?.name ?? undefined, isPending: isPending && !!credentialId }
}
