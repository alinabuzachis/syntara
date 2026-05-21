import type { IdentityProvidersAPI } from '@ansible/nexus-contracts'

import { identityProvidersClient } from '../../../client'
import { useDialogState } from '../../../hooks/useDialogState'
import { useMutationErrorHandler } from '../../../hooks/useMutationErrorHandler'
import { useAlerts } from '../../../providers/alerts'

type IdentityProvider = IdentityProvidersAPI.components['schemas']['IdentityProviderResponse']

export function useIdentityProviderToggle(onSuccess: () => void) {
  const { showAlert } = useAlerts()
  const handleMutationError = useMutationErrorHandler()
  const { mutate: patchProvider, isPending: isDisabling } = identityProvidersClient.useMutation(
    'patch',
    '/identity_providers/{provider_id}'
  )
  const disableDialog = useDialogState<IdentityProvider>()

  function handleToggleEnabled(provider: IdentityProvider) {
    if (!provider.id) return
    if (provider.enabled) {
      disableDialog.open(provider)
    } else {
      patchProvider(
        { params: { path: { provider_id: provider.id } }, body: { enabled: true } },
        {
          onSuccess: () => {
            showAlert({ title: 'Identity provider enabled', variant: 'success', autoDismiss: true })
            onSuccess()
          },
          onError: handleMutationError({ title: 'Failed to enable identity provider' }),
        }
      )
    }
  }

  function handleConfirmDisable() {
    const provider = disableDialog.item
    if (!provider?.id) return
    patchProvider(
      { params: { path: { provider_id: provider.id } }, body: { enabled: false } },
      {
        onSuccess: () => {
          showAlert({ title: 'Identity provider disabled', variant: 'success', autoDismiss: true })
          onSuccess()
        },
        onError: handleMutationError({ title: 'Failed to disable identity provider' }),
        onSettled: () => {
          disableDialog.close()
        },
      }
    )
  }

  return {
    disableDialog,
    isDisabling,
    handleToggleEnabled,
    handleConfirmDisable,
  }
}
