import { zodResolver } from '@hookform/resolvers/zod'
import {
  Alert,
  Button,
  CompassPanel,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  FlexItem,
  Form,
  StackItem,
} from '@patternfly/react-core'
import { RhUiArrowLeftIcon, RhUiSearchIcon, RhUiSyncIcon } from '@patternfly/react-icons'
import { useState, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { useParams } from 'wouter'
import { navigate } from 'wouter/use-browser-location'

import { AppPage } from '../../../../app/AppPage'
import { AppPageHeader } from '../../../../app/AppPageHeader'
import { AppRoute } from '../../../../app/AppRoute'
import { identityProvidersClient } from '../../../../client'
import { useAlerts } from '../../../../components/alerts'
import { useQueryState } from '../../../../components/states/useQueryState'
import { useFormMutationErrorHandler } from '../../../../hooks/useFormMutationErrorHandler'
import { getErrorMessage, isConflictError } from '../../../../utils/apiErrors'

import { IdentityProviderFormFields } from './IdentityProviderFormFields'
import {
  identityProviderDefaults,
  identityProviderAddSchema,
  identityProviderEditSchema,
  OIDC_REDIRECT_URI,
  type IdentityProviderFormData,
} from './identityProviderFormSchema'

const PROVIDER_TYPE_OIDC = 'oidc' as const

interface IdentityProviderFormProps {
  mode: 'add' | 'edit'
}

function endpointFields(formData: IdentityProviderFormData) {
  return {
    authorization_endpoint: formData.autoDiscovery ? null : formData.authorizationEndpoint || null,
    token_endpoint: formData.autoDiscovery ? null : formData.tokenEndpoint || null,
    jwks_uri: formData.autoDiscovery ? null : formData.jwksUri || null,
    userinfo_endpoint: formData.autoDiscovery ? null : formData.userinfoEndpoint || null,
  }
}

function toCreatePayload(formData: IdentityProviderFormData) {
  return {
    name: formData.name,
    enabled: formData.enabled,
    configuration: {
      provider_type: PROVIDER_TYPE_OIDC,
      auto_discovery: formData.autoDiscovery,
      issuer_url: formData.issuerUrl,
      client_id: formData.clientId,
      client_secret: formData.clientSecret,
      redirect_uri: OIDC_REDIRECT_URI,
      scopes: formData.scopes,
      ...endpointFields(formData),
    },
  }
}

function toPatchPayload(formData: IdentityProviderFormData) {
  return {
    name: formData.name,
    enabled: formData.enabled,
    configuration: {
      provider_type: PROVIDER_TYPE_OIDC,
      auto_discovery: formData.autoDiscovery,
      issuer_url: formData.issuerUrl,
      client_id: formData.clientId,
      ...(formData.clientSecret ? { client_secret: formData.clientSecret } : {}),
      redirect_uri: OIDC_REDIRECT_URI,
      scopes: formData.scopes,
      ...endpointFields(formData),
    },
  }
}

interface ProviderConfig {
  auto_discovery?: boolean
  issuer_url?: string
  client_id?: string
  scopes?: string
  authorization_endpoint?: string | null
  token_endpoint?: string | null
  jwks_uri?: string | null
  userinfo_endpoint?: string | null
}

function stringOrEmpty(value?: string | null): string {
  return value ?? ''
}

function toFormValues(provider: {
  name?: string
  enabled?: boolean
  configuration?: ProviderConfig
}): IdentityProviderFormData {
  const c = provider.configuration
  return {
    name: stringOrEmpty(provider.name),
    enabled: provider.enabled ?? false,
    autoDiscovery: c?.auto_discovery ?? true,
    issuerUrl: stringOrEmpty(c?.issuer_url),
    clientId: stringOrEmpty(c?.client_id),
    clientSecret: '',
    scopes: c?.scopes ?? 'openid profile email',
    authorizationEndpoint: stringOrEmpty(c?.authorization_endpoint),
    tokenEndpoint: stringOrEmpty(c?.token_endpoint),
    jwksUri: stringOrEmpty(c?.jwks_uri),
    userinfoEndpoint: stringOrEmpty(c?.userinfo_endpoint),
  }
}

export function IdentityProviderForm({ mode }: Readonly<IdentityProviderFormProps>) {
  const isEdit = mode === 'edit'
  const pageTitle = isEdit ? 'Edit OIDC provider' : 'Add OIDC provider'
  const submitLabel = isEdit ? 'Save provider' : 'Add provider'

  const { providerId } = useParams<{ providerId: string }>()

  const providerQuery = identityProvidersClient.useQuery(
    'get',
    '/{provider_id}',
    { params: { path: { provider_id: providerId ?? '' } } },
    { enabled: isEdit && !!providerId, retry: false }
  )

  const { mutate: createProvider, isPending: isCreating } = identityProvidersClient.useMutation('post', '/')
  const { mutate: patchProvider, isPending: isPatching } = identityProvidersClient.useMutation(
    'patch',
    '/{provider_id}'
  )
  const { mutate: testConnection, isPending: isTesting } = identityProvidersClient.useMutation('post', '/test')

  const { showAlert } = useAlerts()
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  const providerData = providerQuery.data
  const formValues = providerData ? toFormValues(providerData) : undefined

  const schema = isEdit ? identityProviderEditSchema : identityProviderAddSchema
  const { control, handleSubmit, setError, getValues, trigger } = useForm<IdentityProviderFormData>({
    resolver: zodResolver(schema, undefined, { mode: 'sync' }),
    defaultValues: formValues ?? identityProviderDefaults,
    values: isEdit && formValues ? formValues : undefined,
  })
  const handleError = useFormMutationErrorHandler<IdentityProviderFormData>(setError)

  const navigateBack = () => navigate(AppRoute.AccessManagement.Authentication.Root)

  const onSubmit = (formData: IdentityProviderFormData) => {
    const context = formData.name ? `Identity provider "${formData.name}"` : undefined

    const onConflict = (error: unknown) => {
      if (isConflictError(error)) {
        setError('name', {
          message: `An identity provider named "${formData.name}" already exists. Choose a different name.`,
        })
        return
      }
      handleError({
        title: isEdit ? 'Failed to update identity provider' : 'Failed to add identity provider',
        context,
      })(error)
    }

    if (isEdit && providerId) {
      patchProvider(
        { params: { path: { provider_id: providerId } }, body: toPatchPayload(formData) },
        {
          onSuccess: () => {
            showAlert({ title: 'Identity provider updated', variant: 'success', autoDismiss: true })
            navigateBack()
          },
          onError: onConflict,
        }
      )
    } else {
      createProvider(
        { body: toCreatePayload(formData) },
        {
          onSuccess: () => {
            showAlert({ title: 'Identity provider created', variant: 'success', autoDismiss: true })
            navigateBack()
          },
          onError: onConflict,
        }
      )
    }
  }

  const onTestConnection = useCallback(async () => {
    // Only validate issuer URL — that's all the test endpoint needs
    const isValid = await trigger('issuerUrl')
    if (!isValid) return

    const formData = getValues()
    const payload = toCreatePayload(formData)
    // The /test endpoint reuses IdentityProviderCreate which requires `name`,
    // but the test only checks connectivity. Use a placeholder if empty.
    if (!payload.name) {
      payload.name = 'connection-test'
    }
    setTestResult(null)

    testConnection(
      { body: payload },
      {
        onSuccess: (data) => {
          setTestResult({ success: data.success ?? false, message: data.message ?? 'Unknown result' })
        },
        onError: (error: unknown) => {
          setTestResult({ success: false, message: getErrorMessage(error) })
        },
      }
    )
  }, [trigger, getValues, testConnection])

  const isSaving = isCreating || isPatching

  const refetchProvider = providerQuery.refetch
  const queryState = useQueryState(providerQuery, {
    title: 'Error loading identity provider',
    onRetry: () => refetchProvider(),
  })
  if (isEdit && providerQuery.error) {
    return (
      <AppPage>
        <AppPageHeader title="Edit OIDC provider" />
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel isFullHeight>
            <EmptyState headingLevel="h2" titleText="Identity provider not found" icon={RhUiSearchIcon} isFullHeight>
              <EmptyStateBody>
                The identity provider you are looking for does not exist or may have been deleted.
              </EmptyStateBody>
              <EmptyStateFooter>
                <EmptyStateActions>
                  <Button variant="primary" icon={<RhUiArrowLeftIcon />} onClick={navigateBack}>
                    Back to identity providers
                  </Button>
                  <Button
                    variant="link"
                    icon={<RhUiSyncIcon />}
                    onClick={async () => {
                      await refetchProvider()
                    }}
                  >
                    Retry
                  </Button>
                </EmptyStateActions>
              </EmptyStateFooter>
            </EmptyState>
          </CompassPanel>
        </StackItem>
      </AppPage>
    )
  }
  if (isEdit && queryState) {
    return (
      <AppPage>
        <AppPageHeader title={pageTitle} />
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel isFullHeight>{queryState}</CompassPanel>
        </StackItem>
      </AppPage>
    )
  }

  return (
    <AppPage>
      <AppPageHeader title={pageTitle}>
        <FlexItem grow={{ default: 'grow' }} />
        <Button type="submit" form="identity-provider-form" isLoading={isSaving} isDisabled={isSaving}>
          {submitLabel}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            onTestConnection().catch(() => {})
          }}
          isLoading={isTesting}
          isDisabled={isTesting}
        >
          Test connection
        </Button>
        <Button variant="link" onClick={navigateBack}>
          Cancel
        </Button>
      </AppPageHeader>
      <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
        <CompassPanel isFullHeight isScrollable style={{ padding: 'var(--pf-t--global--spacer--xl)' }}>
          <div style={{ maxWidth: '600px' }}>
            {testResult && (
              <Alert
                variant={testResult.success ? 'success' : 'danger'}
                title={testResult.success ? 'Connection successful' : 'Connection failed'}
                isInline
                style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}
              >
                {testResult.message}
              </Alert>
            )}
            <Form id="identity-provider-form" onSubmit={handleSubmit(onSubmit)}>
              <IdentityProviderFormFields control={control} isEdit={isEdit} />
            </Form>
          </div>
        </CompassPanel>
      </StackItem>
    </AppPage>
  )
}
