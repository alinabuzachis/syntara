import { startTransition, useCallback, useOptimistic } from 'react'

import type { Credential } from './credentialConstants'

type EnabledUpdate = {
  id: string
  enabled: boolean
}

type PatchCredentialAsync = (args: {
  params: { path: { credential_id: string } }
  body: { enabled: boolean }
}) => Promise<unknown>

export type UseOptimisticCredentialEnabledOptions = {
  credentials: Credential[]
  patchCredential: PatchCredentialAsync
  /** Called after a successful patch (e.g. refetch). Awaited inside the Action so optimistic UI holds until server state converges. */
  onSuccess: () => void | Promise<unknown>
  onError: (title: string, error: unknown) => void
}

function applyEnabledUpdate(credentials: Credential[], update: EnabledUpdate): Credential[] {
  return credentials.map((credential) =>
    credential.id === update.id ? { ...credential, enabled: update.enabled } : credential
  )
}

/**
 * Optimistic enable/disable for the credentials list.
 *
 * Flips `enabled` immediately via React 19 `useOptimistic`, then patches the API inside a
 * `startTransition` Action. On failure the Action ends without updating server state, so the
 * switch rolls back automatically.
 *
 * @see https://react.dev/reference/react/useOptimistic
 */
export function useOptimisticCredentialEnabled({
  credentials,
  patchCredential,
  onSuccess,
  onError,
}: UseOptimisticCredentialEnabledOptions) {
  const [optimisticCredentials, setOptimisticEnabled] = useOptimistic(credentials, applyEnabledUpdate)

  const setCredentialEnabled = useCallback(
    (credential: Credential, enabled: boolean) => {
      const id = credential.id
      if (!id) return

      startTransition(async () => {
        setOptimisticEnabled({ id, enabled })
        try {
          await patchCredential({
            params: { path: { credential_id: id } },
            body: { enabled },
          })
          await onSuccess()
        } catch (error: unknown) {
          onError(enabled ? 'Failed to enable credential' : 'Failed to disable credential', error)
        }
      })
    },
    [onError, onSuccess, patchCredential, setOptimisticEnabled]
  )

  return { credentials: optimisticCredentials, setCredentialEnabled }
}
