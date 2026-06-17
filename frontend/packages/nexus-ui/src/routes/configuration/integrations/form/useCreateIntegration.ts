import type { ToolProviderCreate } from '@ansible/nexus-contracts'
import { useCallback } from 'react'

import { AppRoute } from '../../../../app/AppRoute'
import { toolManagerClient } from '../../../../client'
import { navigate } from '../../../../hooks/routing/navigate'
import type { useFormMutationErrorHandler } from '../../../../hooks/useFormMutationErrorHandler'
import { useAlerts } from '../../../../providers/alerts'

type UseCreateIntegrationOptions = {
  /** Error handler from useFormMutationErrorHandler */
  handleError: ReturnType<typeof useFormMutationErrorHandler>
}

/**
 * Encapsulates the create → validate → refresh → navigate workflow for integration creation.
 *
 * Handles the complex mutation chain:
 * 1. Create integration
 * 2. Validate the created integration
 * 3. Refresh tools if validation succeeds
 * 4. Navigate back to list
 *
 * This pattern extracts nested mutation callbacks to reduce cognitive complexity
 * and improve testability.
 *
 * @example
 * ```tsx
 * const handleError = useFormMutationErrorHandler(setError)
 * const createIntegration = useCreateIntegration({ handleError })
 *
 * const onSubmit = (formData: IntegrationFormData) => {
 *   createIntegration(formData)
 * }
 * ```
 */
export function useCreateIntegration({ handleError }: UseCreateIntegrationOptions) {
  const { mutate: createIntegration } = toolManagerClient.useMutation('post', '/tool_manager/tool_providers')
  const { mutate: validateIntegration } = toolManagerClient.useMutation(
    'post',
    '/tool_manager/tool_providers/{provider_id}/validate'
  )
  const { mutate: refreshTools } = toolManagerClient.useMutation(
    'post',
    '/tool_manager/tool_providers/{provider_id}/refresh_tools'
  )
  const { showAlert } = useAlerts()

  return useCallback(
    (formData: ToolProviderCreate & { name: string }) => {
      const context = formData.name ? `Integration "${formData.name}"` : undefined
      const navigateToList = () => navigate(AppRoute.Configuration.Integrations.Root)

      createIntegration(
        { body: formData },
        {
          onSuccess: (data) => {
            const providerId = data.id
            if (!providerId) {
              handleError({ title: 'Integration created, but missing ID', context })(
                new Error('Provider ID not returned from API')
              )
              navigateToList()
              return
            }

            validateIntegration(
              { params: { path: { provider_id: providerId } } },
              {
                onError: (error) => {
                  handleError({ title: 'Integration created, but validation failed', context })(error)
                  navigateToList()
                },
                onSuccess: (validationResult) => {
                  if (validationResult.valid) {
                    refreshTools(
                      { params: { path: { provider_id: providerId } } },
                      {
                        onError: handleError({ title: 'Integration created, but refreshing tools failed', context }),
                        onSettled: navigateToList,
                      }
                    )
                    return
                  }

                  showAlert({
                    title: 'Integration created, but validation failed',
                    description: validationResult.error ?? `Provider "${formData.name}" could not be validated.`,
                    variant: 'error',
                    autoDismiss: true,
                  })
                  navigateToList()
                },
              }
            )
          },
          onError: handleError({ title: 'Failed to add integration', context }),
        }
      )
    },
    [createIntegration, validateIntegration, refreshTools, handleError, showAlert]
  )
}
