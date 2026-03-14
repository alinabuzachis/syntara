import type { ToolProviderCreate } from '@ansible/nexus-contracts'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Button,
  CompassPanel,
  Flex,
  FlexItem,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  TextInput,
  ToggleGroup,
  ToggleGroupItem,
} from '@patternfly/react-core'
import { RhUiErrorIcon, RhUiServerFillIcon } from '@patternfly/react-icons'
import { Controller, useForm } from 'react-hook-form'
import { navigate } from 'wouter/use-browser-location'

import { AppPage } from '../../../../app/AppPage'
import { AppPageHeader } from '../../../../app/AppPageHeader'
import { AppRoute } from '../../../../app/AppRoute'
import { toolManagerClient } from '../../../../client'
import { useFormMutationErrorHandler } from '../../../../hooks/useFormMutationErrorHandler'

import { integrationFormSchema, type IntegrationFormData } from './integrationFormSchema'

export function IntegrationForm() {
  const { mutate: createIntegration } = toolManagerClient.useMutation('post', '/tool_providers')
  const { mutate: validateIntegration } = toolManagerClient.useMutation(
    'post',
    '/tool_providers/{provider_id}/validate'
  )
  const { mutate: refreshTools } = toolManagerClient.useMutation('post', '/tool_providers/{provider_id}/refresh_tools')

  const { control, handleSubmit, setError } = useForm<IntegrationFormData>({
    resolver: zodResolver(integrationFormSchema, undefined, { mode: 'sync' }),
    defaultValues: {
      name: '',
      description: '',
      configuration: { provider_type: 'mcp', base_url: '', api_key: '' },
    },
  })
  const handleError = useFormMutationErrorHandler<IntegrationFormData>(setError)

  const onSubmit = (formData: IntegrationFormData) => {
    createIntegration(
      { body: formData as ToolProviderCreate },
      {
        onSuccess: (data) => {
          const providerId = data.id
          validateIntegration(
            { params: { path: { provider_id: providerId } } },
            {
              onError: (error) => {
                handleError({
                  title: 'Integration created, but validation failed',
                  context: formData.name ? `Integration "${formData.name}"` : undefined,
                })(error)
                navigate(AppRoute.Configuration.Integrations.Root)
              },
              onSuccess: () => {
                refreshTools(
                  { params: { path: { provider_id: providerId } } },
                  {
                    onError: handleError({
                      title: 'Integration created, but refreshing tools failed',
                      context: formData.name ? `Integration "${formData.name}"` : undefined,
                    }),
                    onSettled: () => navigate(AppRoute.Configuration.Integrations.Root),
                  }
                )
              },
            }
          )
        },
        onError: handleError({
          title: 'Failed to add integration',
          context: formData.name ? `Integration "${formData.name}"` : undefined,
        }),
      }
    )
  }

  return (
    <AppPage>
      <AppPageHeader title="Configure integration">
        <FlexItem grow={{ default: 'grow' }} />
        <Button type="submit" form="integration-form">
          Add integration
        </Button>
        <Button variant="secondary" onClick={() => navigate(AppRoute.Configuration.Integrations.Root)}>
          Cancel
        </Button>
      </AppPageHeader>
      <CompassPanel isFullHeight style={{ padding: 'var(--pf-t--global--spacer--xl)' }}>
        <div style={{ maxWidth: '600px' }}>
          <Form id="integration-form" onSubmit={handleSubmit(onSubmit)}>
            <FormGroup label="Integration type" fieldId="provider-type" isRequired>
              <Controller
                name="configuration.provider_type"
                control={control}
                render={({ field }) => (
                  <ToggleGroup aria-label="Integration type selection">
                    <ToggleGroupItem
                      text={
                        <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
                          <RhUiServerFillIcon />
                          <span>MCP Server</span>
                        </Flex>
                      }
                      buttonId="mcp"
                      isSelected={field.value === 'mcp'}
                      onChange={() => field.onChange('mcp')}
                    />
                  </ToggleGroup>
                )}
              />
            </FormGroup>
            <Controller
              name="name"
              control={control}
              render={({ field, fieldState }) => (
                <FormGroup label="Server name / ID" fieldId="name" isRequired>
                  <TextInput
                    id="name"
                    placeholder="Enter server name / ID"
                    validated={fieldState.error ? 'error' : 'default'}
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                  />
                  {fieldState.error && (
                    <FormHelperText>
                      <HelperText>
                        <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                          {fieldState.error.message}
                        </HelperTextItem>
                      </HelperText>
                    </FormHelperText>
                  )}
                </FormGroup>
              )}
            />
            <Controller
              name="description"
              control={control}
              render={({ field }) => (
                <FormGroup label="Description" fieldId="description">
                  <TextInput
                    id="description"
                    placeholder="Enter description"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                  />
                </FormGroup>
              )}
            />
            <Controller
              name="configuration.base_url"
              control={control}
              render={({ field, fieldState }) => (
                <FormGroup label="API URL" fieldId="base-url" isRequired>
                  <TextInput
                    id="base-url"
                    placeholder="Enter API URL"
                    validated={fieldState.error ? 'error' : 'default'}
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                  />
                  {fieldState.error && (
                    <FormHelperText>
                      <HelperText>
                        <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                          {fieldState.error.message}
                        </HelperTextItem>
                      </HelperText>
                    </FormHelperText>
                  )}
                </FormGroup>
              )}
            />
            <Controller
              name="configuration.api_key"
              control={control}
              render={({ field, fieldState }) => (
                <FormGroup label="API key" fieldId="api-key">
                  <TextInput
                    id="api-key"
                    placeholder="Enter API key"
                    type="password"
                    validated={fieldState.error ? 'error' : 'default'}
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                  />
                  {fieldState.error && (
                    <FormHelperText>
                      <HelperText>
                        <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                          {fieldState.error.message}
                        </HelperTextItem>
                      </HelperText>
                    </FormHelperText>
                  )}
                </FormGroup>
              )}
            />
          </Form>
        </div>
      </CompassPanel>
    </AppPage>
  )
}
