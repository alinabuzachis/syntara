import type { ToolProviderCreate } from '@ansible/nexus-contracts'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Button,
  Content,
  ContentVariants,
  Flex,
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
import { Controller, type Control, useForm } from 'react-hook-form'

import { AppRoute } from '../../../../app/AppRoute'
import { breadcrumbsIntegrationConfigure } from '../../../../app/breadcrumbBuilders'
import { NxPage, NxPageBody } from '../../../../components/layout/NxPage'
import { NxPageHeader } from '../../../../components/layout/NxPageHeader'
import { NxPanel } from '../../../../components/layout/NxPanel'
import { navigate } from '../../../../hooks/routing/navigate'
import { useFormMutationErrorHandler } from '../../../../hooks/useFormMutationErrorHandler'
import { useDocLink } from '../../../../utils/docs/useDocLink'

import { integrationFormSchema, type IntegrationFormData } from './integrationFormSchema'
import { useCreateIntegration } from './useCreateIntegration'

type TextFieldName = 'name' | 'description' | 'configuration.base_url' | 'configuration.api_key'

type ControlledTextFieldProps = {
  control: Control<IntegrationFormData>
  name: TextFieldName
  label: string
  fieldId: string
  placeholder: string
  isRequired?: boolean
  type?: 'text' | 'password'
}

function ControlledTextField({
  control,
  name,
  label,
  fieldId,
  placeholder,
  isRequired,
  type,
}: ControlledTextFieldProps) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <FormGroup label={label} fieldId={fieldId} isRequired={isRequired}>
          <TextInput
            id={fieldId}
            placeholder={placeholder}
            aria-required={isRequired || undefined}
            type={type}
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
  )
}

export function IntegrationForm() {
  const integrationsDocLink = useDocLink('integrations')
  const { control, handleSubmit, setError } = useForm<IntegrationFormData>({
    resolver: zodResolver(integrationFormSchema, undefined, { mode: 'sync' }),
    defaultValues: {
      name: '',
      description: '',
      configuration: { provider_type: 'mcp', base_url: '', api_key: '' },
    },
  })
  const handleError = useFormMutationErrorHandler<IntegrationFormData>(setError)
  const createIntegration = useCreateIntegration({ handleError })

  const onSubmit = (formData: IntegrationFormData) => {
    createIntegration(formData as ToolProviderCreate & { name: string })
  }

  return (
    <NxPage>
      <NxPageHeader
        title="Configure integration"
        docLink={integrationsDocLink}
        breadcrumbs={breadcrumbsIntegrationConfigure()}
        toolbar={
          <>
            <Button type="submit" form="integration-form">
              Configure integration
            </Button>
            <Button variant="secondary" onClick={() => navigate(AppRoute.Configuration.Integrations.Root)}>
              Cancel
            </Button>
          </>
        }
      />
      <NxPageBody>
        <NxPanel isFullHeight panelMainBodyProps={{ style: { padding: 'var(--pf-t--global--spacer--xl)' } }}>
          <div style={{ maxWidth: '600px' }}>
            <Form id="integration-form" aria-label="Configure integration" onSubmit={handleSubmit(onSubmit)}>
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
                            <Content component={ContentVariants.p} style={{ margin: 0 }}>
                              MCP Server
                            </Content>
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
              <ControlledTextField
                control={control}
                name="name"
                label="Server name / ID"
                fieldId="name"
                placeholder="Enter server name / ID"
                isRequired
              />
              <ControlledTextField
                control={control}
                name="description"
                label="Description"
                fieldId="description"
                placeholder="Enter description"
              />
              <ControlledTextField
                control={control}
                name="configuration.base_url"
                label="API URL"
                fieldId="base-url"
                placeholder="Enter API URL"
                isRequired
              />
              <ControlledTextField
                control={control}
                name="configuration.api_key"
                label="API key"
                fieldId="api-key"
                placeholder="Enter API key"
                type="password"
              />
            </Form>
          </div>
        </NxPanel>
      </NxPageBody>
    </NxPage>
  )
}
