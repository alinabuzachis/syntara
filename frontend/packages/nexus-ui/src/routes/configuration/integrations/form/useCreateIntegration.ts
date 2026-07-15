import { IntegrationTypeEnum, type IntegrationsAPI } from '@ansible/nexus-contracts'
import { useCallback } from 'react'

import { AppRoute } from '../../../../app/AppRoute'
import { tanstackRouter } from '../../../../app/tanstackRouter'
import { integrationsClient } from '../../../../client'
import type { useFormMutationErrorHandler } from '../../../../hooks/useFormMutationErrorHandler'
import { useAlerts } from '../../../../providers/alerts'
import { detachPromise } from '../../../../utils/detachPromise'

import type { IntegrationFormData } from './integrationFormSchema'

type UseCreateIntegrationOptions = {
  handleError: ReturnType<typeof useFormMutationErrorHandler>
}

/**
 * Encapsulates the create → navigate workflow for integration creation.
 *
 * Creates the integration via POST /integrations and navigates back to the
 * list. No post-save validation — the admin already tested the connection
 * in the wizard's step 2.
 */
type InitialToolSelection = {
  name: string
  description?: string | null
  enabled: boolean
  parameters?: Record<string, unknown>[] | null
}

type InitialModelSelection = IntegrationsAPI.components['schemas']['InitialModelSelection']

export function useCreateIntegration({ handleError }: UseCreateIntegrationOptions) {
  const { mutate: createIntegration } = integrationsClient.useMutation('post', '/integrations')
  const { showAlert } = useAlerts()

  return useCallback(
    (
      formData: IntegrationFormData,
      discoveredTools?: InitialToolSelection[],
      discoveredModels?: InitialModelSelection[]
    ) => {
      const context = formData.name ? `Integration "${formData.name}"` : undefined
      const navigateToList = () => {
        detachPromise(tanstackRouter.navigate({ to: AppRoute.Configuration.Integrations.Root }))
      }

      createIntegration(
        {
          body: {
            name: formData.name,
            description: formData.description ?? undefined,
            integration_type: formData.integration_type,
            configuration: formData.configuration,
            management_credential_id: formData.management_credential_id ?? undefined,
            scope: formData.scope,
            discovered_tools:
              formData.integration_type === IntegrationTypeEnum.MCP_SERVER ? (discoveredTools ?? null) : null,
            discovered_models: discoveredModels ?? null,
          },
        },
        {
          onSuccess: () => {
            showAlert({
              title: 'Integration created',
              description: `"${formData.name}" has been saved.`,
              variant: 'success',
              autoDismiss: true,
            })
            navigateToList()
          },
          onError: handleError({ title: 'Failed to add integration', context }),
        }
      )
    },
    [createIntegration, handleError, showAlert]
  )
}
