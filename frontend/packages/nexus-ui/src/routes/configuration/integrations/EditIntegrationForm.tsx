import type { IntegrationsAPI } from '@ansible/nexus-contracts'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  ActionGroup,
  Button,
  Content,
  ContentVariants,
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
import { useCallback, useEffect } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'

import { AppRoute } from '../../../app/AppRoute'
import { breadcrumbsIntegrationEdit } from '../../../app/breadcrumbBuilders'
import { integrationsClient } from '../../../client'
import { NxPage, NxPageBody } from '../../../components/layout/NxPage'
import { NxPageHeader } from '../../../components/layout/NxPageHeader'
import { NxPanel } from '../../../components/layout/NxPanel'
import { NxErrorState } from '../../../components/states/NxErrorState'
import { useQueryState } from '../../../components/states/useQueryState'
import { useNavigate } from '../../../hooks/routing/useNavigate'
import { useParams } from '../../../hooks/routing/useParams'
import { useFormMutationErrorHandler } from '../../../hooks/useFormMutationErrorHandler'
import { useAlerts } from '../../../providers/alerts'
import { getErrorMessage } from '../../../utils/apiErrors'
import { detachPromise } from '../../../utils/detachPromise'
import { useDocLink } from '../../../utils/docs/useDocLink'
import { CredentialSelector } from '../../builder/components/CredentialSelector'

import styles from './EditIntegrationForm.module.css'
import { CREDENTIAL_TYPES_BY_INTEGRATION, INTEGRATION_TYPE_LABELS } from './integrationFilters'
import { getBaseUrl } from './integrationUtils'

const editIntegrationSchema = z.object({
  name: z.string().min(1, 'Server name / ID is required'),
  description: z.string(),
  base_url: z
    .string()
    .url('Must be a valid URL')
    .refine((url) => /^https?:\/\//.test(url), 'Must be an HTTP or HTTPS URL'),
  scope: z.enum(['global', 'project']),
  management_credential_id: z.string().nullable(),
})

type EditIntegrationFormValues = z.infer<typeof editIntegrationSchema>

type DiscoverResult = IntegrationsAPI.components['schemas']['DiscoverResult']
type IntegrationRead = IntegrationsAPI.components['schemas']['IntegrationRead']

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
  return (
    <>
      <Title headingLevel="h2" size="lg">
        Integration details
      </Title>

      <FormGroup label="Integration type" fieldId="edit-integration-type">
        <Content component={ContentVariants.p}>
          {INTEGRATION_TYPE_LABELS[integration.integration_type ?? ''] ?? integration.integration_type ?? ''}
        </Content>
      </FormGroup>

      <FormGroup label="Server name / ID" isRequired fieldId="edit-name">
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

      <FormGroup label="API URL" isRequired fieldId="edit-base-url">
        <Controller
          name="base_url"
          control={control}
          render={({ field }) => (
            <TextInput id="edit-base-url" isRequired validated={errors.base_url ? 'error' : 'default'} {...field} />
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
          This credential is used to verify the connection to this integration and perform periodic health checks.
          Workflow credentials are configured separately in the workflow builder.
        </Content>
      </div>

      <Controller
        name="management_credential_id"
        control={control}
        render={({ field }) => (
          <CredentialSelector
            value={field.value ?? undefined}
            onChange={(id) => setValue('management_credential_id', id ?? null)}
            compatibleTypeNames={CREDENTIAL_TYPES_BY_INTEGRATION.mcp_server}
            label="Health check credential"
            fieldId="edit-credential-select"
            allowCreate
            placeholder="Select a credential"
            helpText="Used to test and monitor the connection to this integration."
          />
        )}
      />

      <FormGroup fieldId="test-connection">
        <Button
          variant="secondary"
          onClick={!credentialId || isTesting ? undefined : onTestConnection}
          isLoading={isTesting}
          isAriaDisabled={!credentialId || isTesting}
        >
          Test connection
        </Button>
      </FormGroup>
    </>
  )
}

export function EditIntegrationForm() {
  const { integrationId } = useParams<{ integrationId: string }>()
  const navigate = useNavigate()
  const { showAlert } = useAlerts()
  const docLink = useDocLink('integrations')

  const query = integrationsClient.useQuery('get', '/integrations/{integration_id}', {
    params: { path: { integration_id: integrationId ?? '' } },
  })
  const integration = query.data

  const detailPath = AppRoute.Configuration.Integrations.Detail.replace(':integrationId', integrationId ?? '')
  const breadcrumbs = breadcrumbsIntegrationEdit(integration?.name ?? 'Integration', detailPath)

  const {
    control,
    handleSubmit,
    reset,
    setError,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<EditIntegrationFormValues>({
    resolver: zodResolver(editIntegrationSchema),
    defaultValues: {
      name: '',
      description: '',
      base_url: '',
      scope: 'global',
      management_credential_id: null,
    },
  })

  useEffect(() => {
    if (integration) {
      reset({
        name: integration.name ?? '',
        description: integration.description ?? '',
        base_url: getBaseUrl(integration),
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

  const { mutate: testConnection, isPending: isTesting } = integrationsClient.useMutation(
    'post',
    '/integrations/discover'
  )

  const handleTestConnection = useCallback(() => {
    const values = getValues()
    const credId = values.management_credential_id
    if (!credId) return

    testConnection(
      {
        body: {
          integration_type: integration?.integration_type ?? 'mcp_server',
          configuration: { integration_type: 'mcp_server', base_url: values.base_url },
          credential_id: credId,
        },
      },
      {
        onSuccess: (result: DiscoverResult) => {
          if (result.success) {
            const toolCount = result.discovered_tools?.length ?? 0
            showAlert({
              title: 'Connection tested',
              description:
                toolCount > 0
                  ? `Successfully connected. Discovered ${String(toolCount)} tool(s).`
                  : 'Successfully connected. The integration is reachable.',
              variant: 'success',
              autoDismiss: true,
            })
          } else {
            showAlert({
              title: 'Connection failed',
              description: result.error ?? 'Unable to connect to the integration.',
              variant: 'danger',
              autoDismiss: true,
            })
          }
        },
        onError: (error: unknown) => {
          showAlert({
            title: 'Connection test failed',
            description: getErrorMessage(error),
            variant: 'danger',
            autoDismiss: true,
          })
        },
      }
    )
  }, [getValues, testConnection, showAlert, integration?.integration_type])

  function onSubmit(values: EditIntegrationFormValues) {
    if (!integrationId) return

    const body: IntegrationsAPI.components['schemas']['IntegrationPatch'] = {
      name: values.name,
      description: values.description || null,
      scope: values.scope,
      configuration: {
        integration_type: 'mcp_server',
        base_url: values.base_url,
      },
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
          navigate(detailPath)
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
                Save
              </Button>
              <Button
                variant="link"
                onClick={isSaving ? undefined : () => navigate(detailPath)}
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
