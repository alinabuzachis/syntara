import type { IntegrationsAPI } from '@ansible/nexus-contracts'
import { IntegrationTypeEnum } from '@ansible/nexus-contracts'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  ActionGroup,
  Alert,
  Button,
  Content,
  ContentVariants,
  DescriptionList,
  Divider,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Switch,
  TextArea,
  TextInput,
  Title,
} from '@patternfly/react-core'
import { RhUiErrorIcon } from '@patternfly/react-icons'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useEffect, useMemo } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'

import { AppRoute } from '../../../app/AppRoute'
import { breadcrumbsIntegrationEdit } from '../../../app/breadcrumbBuilders'
import { integrationsClient } from '../../../client'
import { NxDetail } from '../../../components/details/NxDetail'
import { NxPage, NxPageBody } from '../../../components/layout/NxPage'
import { NxPageHeader } from '../../../components/layout/NxPageHeader'
import { NxPanel } from '../../../components/layout/NxPanel'
import { NxPageTitle } from '../../../components/NxPageTitle'
import { NxErrorState } from '../../../components/states/NxErrorState'
import { useQueryState } from '../../../components/states/useQueryState'
import { useFormMutationErrorHandler } from '../../../hooks/useFormMutationErrorHandler'
import { useAlerts } from '../../../providers/alerts'
import { detachPromise } from '../../../utils/detachPromise'
import { useDocLink } from '../../../utils/docs/useDocLink'
import { CredentialSelector } from '../../builder/components/CredentialSelector'

import styles from './EditIntegrationForm.module.css'
import type { EditIntegrationFormValues, IntegrationRead } from './editIntegrationFormSchema'
import { buildConfiguration, buildEditSchema, editIntegrationSchema } from './editIntegrationFormSchema'
import {
  CREDENTIAL_REQUIRED_TYPES,
  CREDENTIAL_TYPES_BY_INTEGRATION,
  INTEGRATION_TYPE_LABELS,
  PROVIDER_HINT_LABELS,
  PROVIDERS_HIDING_BASE_URL,
  PROVIDERS_REQUIRING_BASE_URL,
} from './integrationFilters'
import { getProviderHint, isLLMProvider } from './integrationUtils'
import { useEditTestConnection } from './useEditTestConnection'

const CREDENTIAL_DESCRIPTION: Record<string, string> = {
  [IntegrationTypeEnum.MCP_SERVER]:
    'This credential is used for tool discovery and connection status checks. MCP servers that do not require authentication can be configured without one.',
  [IntegrationTypeEnum.LLM_PROVIDER]:
    'This credential is used to verify the connection to this integration and perform periodic health checks. Workflow credentials are configured separately in the workflow builder.',
  [IntegrationTypeEnum.ANSIBLE_AUTOMATION_PLATFORM]:
    'This credential is used to verify the connection to the Ansible Automation Platform. Workflow credentials are configured separately in the workflow builder.',
}

function AapConfigurationFields({
  control,
  errors,
}: Readonly<{
  control: ReturnType<typeof useForm<EditIntegrationFormValues>>['control']
  errors: ReturnType<typeof useForm<EditIntegrationFormValues>>['formState']['errors']
}>) {
  return (
    <>
      <FormGroup label="AAP URL" isRequired fieldId="edit-aap-url">
        <Controller
          name="aap_url"
          control={control}
          render={({ field }) => (
            <TextInput
              id="edit-aap-url"
              isRequired
              placeholder="e.g. https://aap.example.com"
              validated={errors.aap_url ? 'error' : 'default'}
              {...field}
            />
          )}
        />
        {errors.aap_url && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                {errors.aap_url.message}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>
      <FormGroup label="Verify SSL certificate" fieldId="edit-tls-verify">
        <Controller
          name="insecure_skip_tls_verify"
          control={control}
          render={({ field }) => (
            <>
              <Switch
                id="edit-tls-verify"
                label={field.value ? 'SSL verification disabled' : 'SSL verification enabled'}
                aria-label="SSL verification"
                hasCheckIcon
                isChecked={!field.value}
                onChange={(_event, checked) => field.onChange(!checked)}
              />
              {field.value && (
                <Alert variant="warning" isInline isPlain title="Insecure connection">
                  Disabling TLS verification is insecure and not recommended for production environments.
                </Alert>
              )}
            </>
          )}
        />
      </FormGroup>
    </>
  )
}

type FormFieldsProps = Readonly<{
  integration: IntegrationRead
  control: ReturnType<typeof useForm<EditIntegrationFormValues>>['control']
  errors: ReturnType<typeof useForm<EditIntegrationFormValues>>['formState']['errors']
  scope: string
  credentialId: string | null | undefined
  isTesting: boolean
  setValue: ReturnType<typeof useForm<EditIntegrationFormValues>>['setValue']
  onTestConnection: () => void
}>

function EditIntegrationFormFields({
  integration,
  control,
  errors,
  scope,
  credentialId,
  isTesting,
  setValue,
  onTestConnection,
}: FormFieldsProps) {
  const isCredentialRequired = CREDENTIAL_REQUIRED_TYPES.has(integration.integration_type ?? '')
  const isTestDisabled = (isCredentialRequired && !credentialId) || isTesting
  const isAnsibleAutomationPlatform = integration.integration_type === IntegrationTypeEnum.ANSIBLE_AUTOMATION_PLATFORM
  const isLLM = isLLMProvider(integration)
  const hideBaseUrl =
    isAnsibleAutomationPlatform || (isLLM && PROVIDERS_HIDING_BASE_URL.has(getProviderHint(integration)))

  const credentialDescription =
    CREDENTIAL_DESCRIPTION[integration.integration_type ?? ''] ?? CREDENTIAL_DESCRIPTION[IntegrationTypeEnum.MCP_SERVER]

  return (
    <>
      <Title headingLevel="h2" size="lg">
        Integration details
      </Title>

      <DescriptionList isCompact isHorizontal>
        <NxDetail label="Integration type">
          {INTEGRATION_TYPE_LABELS[integration.integration_type ?? ''] ?? integration.integration_type ?? ''}
        </NxDetail>
        {isLLM && (
          <NxDetail label="Provider type">
            {PROVIDER_HINT_LABELS[getProviderHint(integration)] ?? getProviderHint(integration)}
          </NxDetail>
        )}
      </DescriptionList>

      <FormGroup label={isLLM ? 'Name' : 'Server name / ID'} isRequired fieldId="edit-name">
        <Controller
          name="name"
          control={control}
          render={({ field }) => (
            <TextInput id="edit-name" isRequired validated={errors.name ? 'error' : 'default'} {...field} />
          )}
        />
        {errors.name && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                {errors.name.message}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>

      <FormGroup label="Description" fieldId="edit-description">
        <Controller
          name="description"
          control={control}
          render={({ field }) => (
            <TextArea
              id="edit-description"
              aria-label="Description"
              resizeOrientation="vertical"
              value={field.value ?? ''}
              onChange={(_event, value) => field.onChange(value)}
              onBlur={field.onBlur}
              name={field.name}
            />
          )}
        />
      </FormGroup>

      {!hideBaseUrl && (
        <FormGroup label="API URL" isRequired={!isLLM} fieldId="edit-base-url">
          <Controller
            name="base_url"
            control={control}
            render={({ field }) => (
              <TextInput
                id="edit-base-url"
                isRequired={!isLLM}
                validated={errors.base_url ? 'error' : 'default'}
                {...field}
              />
            )}
          />
          {errors.base_url && (
            <FormHelperText>
              <HelperText>
                <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                  {errors.base_url.message}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          )}
        </FormGroup>
      )}

      {isAnsibleAutomationPlatform && <AapConfigurationFields control={control} errors={errors} />}

      <FormGroup label="Scope" fieldId="edit-integration-scope">
        <Controller
          name="scope"
          control={control}
          render={({ field }) => (
            <Switch
              id="edit-integration-scope"
              label="Global"
              aria-label="Integration scope"
              hasCheckIcon
              isChecked={field.value === 'global'}
              onChange={(_event, checked) => field.onChange(checked ? 'global' : 'project')}
            />
          )}
        />
        <FormHelperText>
          <HelperText>
            <HelperTextItem>
              {scope === 'global'
                ? 'Global integrations are available to all projects. Turn off to scope this integration to specific projects.'
                : 'This integration will only be available to selected projects.'}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>

      <Divider />

      <div>
        <Title headingLevel="h2" size="lg" className={styles.credentialHeading}>
          Connection credential
        </Title>
        <Content component={ContentVariants.p} className={styles.credentialDescription}>
          {credentialDescription}
        </Content>
      </div>

      <Controller
        name="management_credential_id"
        control={control}
        render={({ field }) => (
          <CredentialSelector
            value={field.value ?? undefined}
            onChange={(id) => setValue('management_credential_id', id ?? null)}
            compatibleTypeNames={
              CREDENTIAL_TYPES_BY_INTEGRATION[integration.integration_type ?? IntegrationTypeEnum.MCP_SERVER]
            }
            label="Health check credential"
            fieldId="edit-credential-select"
            isRequired={isCredentialRequired}
            allowCreate
            placeholder="Select a credential"
            helpText={
              isAnsibleAutomationPlatform
                ? 'Used to authenticate with the Ansible Automation Platform for connection testing.'
                : 'Used to test and monitor the connection to this integration.'
            }
          />
        )}
      />

      <FormGroup fieldId="test-connection">
        <Button
          variant="secondary"
          onClick={isTestDisabled ? undefined : onTestConnection}
          isLoading={isTesting}
          isAriaDisabled={isTestDisabled}
        >
          Test connection
        </Button>
      </FormGroup>
    </>
  )
}

export function EditIntegrationForm() {
  const { integrationId }: { integrationId: string } = useParams({ strict: false })
  const navigate = useNavigate()
  const { showAlert } = useAlerts()
  const docLink = useDocLink('integrations')

  const query = integrationsClient.useQuery('get', '/integrations/{integration_id}', {
    params: { path: { integration_id: integrationId ?? '' } },
  })
  const integration = query.data

  const detailPath = AppRoute.Configuration.Integrations.Detail.replace(':integrationId', integrationId ?? '')
  const breadcrumbs = breadcrumbsIntegrationEdit(integration?.name ?? 'Integration', detailPath)

  const schema = useMemo(() => {
    if (!integration) return editIntegrationSchema
    const requiresBaseUrl = isLLMProvider(integration)
      ? PROVIDERS_REQUIRING_BASE_URL.has(getProviderHint(integration))
      : true
    return buildEditSchema(requiresBaseUrl)
  }, [integration])

  const {
    control,
    handleSubmit,
    reset,
    setError,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<EditIntegrationFormValues>({
    resolver: zodResolver(schema, undefined, { mode: 'sync' }),
    defaultValues: {
      name: '',
      description: '',
      integration_type: '',
      base_url: '',
      aap_url: '',
      insecure_skip_tls_verify: false,
      scope: 'global',
      management_credential_id: null,
    },
  })

  useEffect(() => {
    if (integration) {
      const config = integration.configuration
      reset({
        name: integration.name ?? '',
        description: integration.description ?? '',
        integration_type: integration.integration_type ?? IntegrationTypeEnum.MCP_SERVER,
        base_url: 'base_url' in config ? String(config.base_url ?? '') : '',
        aap_url: 'aap_url' in config ? String(config.aap_url ?? '') : '',
        insecure_skip_tls_verify:
          'insecure_skip_tls_verify' in config ? Boolean(config.insecure_skip_tls_verify) : false,
        scope: (integration.scope as 'global' | 'project') ?? 'global',
        management_credential_id: integration.management_credential_id ?? null,
      })
    }
  }, [integration, reset])

  const scope = useWatch({ control, name: 'scope' })
  const credentialId = useWatch({ control, name: 'management_credential_id' })

  const handleError = useFormMutationErrorHandler<EditIntegrationFormValues>(setError)

  const { mutate: patchIntegration, isPending: isSaving } = integrationsClient.useMutation(
    'patch',
    '/integrations/{integration_id}'
  )

  const { handleTestConnection, isTesting } = useEditTestConnection(integration, getValues)

  function onSubmit(values: EditIntegrationFormValues) {
    if (!integrationId || !integration) return

    const integrationType = integration.integration_type ?? IntegrationTypeEnum.MCP_SERVER

    const body: IntegrationsAPI.components['schemas']['IntegrationPatch'] = {
      name: values.name,
      description: values.description || null,
      scope: values.scope,
      configuration: buildConfiguration(
        integrationType,
        values,
        isLLMProvider(integration) ? getProviderHint(integration) : undefined
      ),
      management_credential_id: values.management_credential_id,
    }

    patchIntegration(
      { params: { path: { integration_id: integrationId } }, body },
      {
        onSuccess: () => {
          showAlert({
            title: 'Integration updated',
            description: `"${values.name}" has been updated.`,
            variant: 'success',
            autoDismiss: true,
          })
          detachPromise(navigate({ to: detailPath }))
        },
        onError: handleError({
          title: 'Failed to update integration',
          context: `Integration "${values.name}"`,
        }),
      }
    )
  }

  const queryState = useQueryState(query, {
    title: 'Error loading integration',
    onRetry: () => detachPromise(query.refetch()),
  })

  if (!integrationId || queryState) {
    return (
      <NxPage>
        <NxPageTitle segments={['Edit integration', 'Integrations']} />
        <NxPageHeader title="Edit integration" breadcrumbs={breadcrumbs} docLink={docLink} />
        <NxPageBody>
          <NxPanel isFullHeight>
            {queryState ?? <NxErrorState message="Missing integration ID" title="Error" />}
          </NxPanel>
        </NxPageBody>
      </NxPage>
    )
  }

  if (!integration) return null

  return (
    <NxPage>
      <NxPageTitle segments={['Edit integration', 'Integrations']} />
      <NxPageHeader title="Edit integration" breadcrumbs={breadcrumbs} docLink={docLink} />
      <NxPageBody>
        <NxPanel
          isFullHeight
          isScrollable
          panelMainBodyProps={{ className: styles.panelBody }}
          footer={
            <ActionGroup>
              <Button
                variant="primary"
                type="submit"
                form="edit-integration-form"
                isLoading={isSaving}
                isAriaDisabled={isSaving}
              >
                Save integration
              </Button>
              <Button
                variant="link"
                onClick={isSaving ? undefined : () => detachPromise(navigate({ to: detailPath }))}
                isAriaDisabled={isSaving}
              >
                Cancel
              </Button>
            </ActionGroup>
          }
        >
          <Form
            id="edit-integration-form"
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault()
              detachPromise(handleSubmit(onSubmit)())
            }}
          >
            <EditIntegrationFormFields
              integration={integration}
              control={control}
              errors={errors}
              scope={scope}
              credentialId={credentialId}
              isTesting={isTesting}
              setValue={setValue}
              onTestConnection={handleTestConnection}
            />
          </Form>
        </NxPanel>
      </NxPageBody>
    </NxPage>
  )
}
