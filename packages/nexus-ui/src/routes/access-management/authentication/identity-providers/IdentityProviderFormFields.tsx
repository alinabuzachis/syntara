import {
  FormGroup,
  FormHelperText,
  FormSection,
  HelperText,
  HelperTextItem,
  Switch,
  TextInput,
} from '@patternfly/react-core'
import { RhUiErrorIcon } from '@patternfly/react-icons'
import { Controller, useWatch, type Control, type FieldError } from 'react-hook-form'

import { OIDC_REDIRECT_URI, type IdentityProviderFormData } from './identityProviderFormSchema'

function FieldErrorMessage({ error }: Readonly<{ error?: FieldError }>) {
  if (!error) return null
  return (
    <FormHelperText>
      <HelperText>
        <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
          {error.message}
        </HelperTextItem>
      </HelperText>
    </FormHelperText>
  )
}

function HintOrError({ error, hint }: Readonly<{ error?: FieldError; hint: string }>) {
  return (
    <FormHelperText>
      <HelperText>
        <HelperTextItem variant={error ? 'error' : 'default'} icon={error ? <RhUiErrorIcon /> : undefined}>
          {error?.message ?? hint}
        </HelperTextItem>
      </HelperText>
    </FormHelperText>
  )
}

function ManualEndpointFields({ control }: Readonly<{ control: Control<IdentityProviderFormData> }>) {
  return (
    <>
      <Controller
        name="authorizationEndpoint"
        control={control}
        render={({ field, fieldState }) => (
          <FormGroup label="Authorization Endpoint" fieldId="authorization-endpoint" isRequired>
            <TextInput
              id="authorization-endpoint"
              placeholder="https://provider.com/oauth2/authorize"
              validated={fieldState.error ? 'error' : 'default'}
              {...field}
            />
            <HintOrError error={fieldState.error} hint="URL where users are redirected to authenticate" />
          </FormGroup>
        )}
      />
      <Controller
        name="tokenEndpoint"
        control={control}
        render={({ field, fieldState }) => (
          <FormGroup label="Token Endpoint" fieldId="token-endpoint" isRequired>
            <TextInput
              id="token-endpoint"
              placeholder="https://provider.com/oauth2/token"
              validated={fieldState.error ? 'error' : 'default'}
              {...field}
            />
            <HintOrError error={fieldState.error} hint="URL where authorization codes are exchanged for tokens" />
          </FormGroup>
        )}
      />
      <Controller
        name="jwksUri"
        control={control}
        render={({ field, fieldState }) => (
          <FormGroup label="JWKS URI" fieldId="jwks-uri" isRequired>
            <TextInput
              id="jwks-uri"
              placeholder="https://provider.com/oauth2/keys"
              validated={fieldState.error ? 'error' : 'default'}
              {...field}
            />
            <HintOrError error={fieldState.error} hint="URL to fetch public keys for token signature verification" />
          </FormGroup>
        )}
      />
      <Controller
        name="userinfoEndpoint"
        control={control}
        render={({ field, fieldState }) => (
          <FormGroup label="Userinfo Endpoint" fieldId="userinfo-endpoint">
            <TextInput
              id="userinfo-endpoint"
              placeholder="https://provider.com/oauth2/userinfo"
              validated={fieldState.error ? 'error' : 'default'}
              {...field}
            />
            <HintOrError error={fieldState.error} hint="URL to fetch additional user claims (optional)" />
          </FormGroup>
        )}
      />
    </>
  )
}

interface IdentityProviderFormFieldsProps {
  control: Control<IdentityProviderFormData>
  isEdit?: boolean
}

export function IdentityProviderFormFields({ control, isEdit }: Readonly<IdentityProviderFormFieldsProps>) {
  const autoDiscovery = useWatch({ control, name: 'autoDiscovery' })

  return (
    <FormSection title="Provider Configuration">
      <Controller
        name="name"
        control={control}
        render={({ field, fieldState }) => (
          <FormGroup label="Provider Name" fieldId="provider-name" isRequired>
            <TextInput
              id="provider-name"
              placeholder="Enter provider name"
              validated={fieldState.error ? 'error' : 'default'}
              {...field}
            />
            <FieldErrorMessage error={fieldState.error} />
          </FormGroup>
        )}
      />

      <Controller
        name="enabled"
        control={control}
        render={({ field }) => (
          <FormGroup label="Enable Provider" fieldId="provider-enabled">
            <Switch
              id="provider-enabled"
              label="Enabled"
              hasCheckIcon
              isChecked={field.value}
              onChange={(_event, checked) => field.onChange(checked)}
            />
          </FormGroup>
        )}
      />

      <Controller
        name="autoDiscovery"
        control={control}
        render={({ field }) => (
          <FormGroup label="Auto-Discovery" fieldId="auto-discovery">
            <Switch
              id="auto-discovery"
              label="Use OIDC Discovery"
              hasCheckIcon
              isChecked={field.value}
              onChange={(_event, checked) => field.onChange(checked)}
            />
          </FormGroup>
        )}
      />

      <Controller
        name="issuerUrl"
        control={control}
        render={({ field, fieldState }) => (
          <FormGroup label="Issuer URL" fieldId="issuer-url" isRequired>
            <TextInput
              id="issuer-url"
              placeholder="https://accounts.google.com"
              validated={fieldState.error ? 'error' : 'default'}
              {...field}
            />
            <HintOrError error={fieldState.error} hint="The base URL of your OpenID Connect provider" />
          </FormGroup>
        )}
      />

      {!autoDiscovery && <ManualEndpointFields control={control} />}

      <Controller
        name="clientId"
        control={control}
        render={({ field, fieldState }) => (
          <FormGroup label="Client ID" fieldId="client-id" isRequired>
            <TextInput
              id="client-id"
              placeholder="your-client-id"
              validated={fieldState.error ? 'error' : 'default'}
              {...field}
            />
            <FieldErrorMessage error={fieldState.error} />
          </FormGroup>
        )}
      />

      <Controller
        name="clientSecret"
        control={control}
        render={({ field, fieldState }) => (
          <FormGroup label="Client Secret" fieldId="client-secret" isRequired={!isEdit}>
            <TextInput
              id="client-secret"
              placeholder={isEdit ? 'Enter new secret to update' : 'your-client-secret'}
              type="password"
              validated={fieldState.error ? 'error' : 'default'}
              {...field}
            />
            {isEdit ? (
              <HintOrError
                error={fieldState.error}
                hint="Leave empty to keep the existing secret. Enter a new value to update it."
              />
            ) : (
              <FieldErrorMessage error={fieldState.error} />
            )}
          </FormGroup>
        )}
      />

      <FormGroup label="Redirect URI" fieldId="redirect-uri">
        <TextInput id="redirect-uri" value={OIDC_REDIRECT_URI} isDisabled />
        <FormHelperText>
          <HelperText>
            <HelperTextItem>Copy this value into your identity provider's OAuth app configuration</HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>

      <Controller
        name="scopes"
        control={control}
        render={({ field, fieldState }) => (
          <FormGroup label="Scopes" fieldId="scopes" isRequired>
            <TextInput
              id="scopes"
              placeholder="openid profile email"
              validated={fieldState.error ? 'error' : 'default'}
              {...field}
            />
            <HintOrError
              error={fieldState.error}
              hint='Space-separated list of OAuth 2.0 scopes (e.g., "openid profile email")'
            />
          </FormGroup>
        )}
      />
    </FormSection>
  )
}
