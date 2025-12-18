import type { ToolProvider } from '@ansible/nexus-contracts'
import {
  Button,
  Card,
  CardBody,
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
import { RhUiErrorIcon, ServerIcon } from '@patternfly/react-icons'
import { Controller, useForm } from 'react-hook-form'
import { navigate } from 'wouter/use-browser-location'

import { AppPage } from '../../../../app/AppPage'
import { AppPageHeader } from '../../../../app/AppPageHeader'
import { AppRoute } from '../../../../app/AppRoute'
import { toolProvidersClient } from '../../../../client'

export function IntegrationForm() {
  const { mutate: createIntegration } = toolProvidersClient.useMutation('post', '/tool-providers')
  const { mutate: validateIntegration } = toolProvidersClient.useMutation(
    'post',
    '/tool-providers/{provider_id}/validate'
  )
  const { mutate: refreshTools } = toolProvidersClient.useMutation(
    'post',
    '/tool-providers/{provider_id}/refresh-tools'
  )

  const { control, handleSubmit } = useForm<ToolProvider>({
    defaultValues: {
      configuration: { provider_type: 'mcp' },
    },
  })

  const onSubmit = (toolProvider: ToolProvider) => {
    createIntegration(
      { body: toolProvider },
      {
        onSuccess: (data) => {
          const providerId = data.id
          validateIntegration(
            { params: { path: { provider_id: providerId } } },
            {
              onSettled: () => {
                refreshTools(
                  { params: { path: { provider_id: providerId } } },
                  { onSettled: () => navigate(AppRoute.Configuration.Integrations.Root) }
                )
              },
            }
          )
        },
      }
    )
  }

  return (
    <AppPage>
      <AppPageHeader title="Configure Integration">
        <FlexItem grow={{ default: 'grow' }} />
        <Button type="submit" form="integration-form">
          Add integration
        </Button>
        <Button variant="secondary" onClick={() => navigate(AppRoute.Configuration.Integrations.Root)}>
          Cancel
        </Button>
      </AppPageHeader>
      <Card isPlain className="glass" isFullHeight>
        <CardBody style={{ maxWidth: '600px' }}>
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
                          <ServerIcon />
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
              rules={{ required: 'Server name is required' }}
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
              rules={{ required: 'API URL is required' }}
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
              render={({ field }) => (
                <FormGroup label="API key" fieldId="api-key">
                  <TextInput
                    id="api-key"
                    placeholder="Enter API key"
                    type="password"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                  />
                </FormGroup>
              )}
            />
          </Form>
        </CardBody>
      </Card>
    </AppPage>
  )
}
