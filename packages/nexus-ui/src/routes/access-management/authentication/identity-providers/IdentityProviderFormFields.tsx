import {
  ClipboardCopy,
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

import { TagInput } from '../../../../components/forms/TagInput'

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

type IdentityProviderFormFieldsProps = {
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

      <Controller
        name="autoDiscovery"
        control={control}
        render={({ field }) => (
          <FormGroup fieldId="auto-discovery">
            <Switch
              id="auto-discovery"
              label="Use OIDC Discovery"
              hasCheckIcon
              isChecked={field.value}
              onChange={(_event, checked) => field.onChange(checked)}
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>
                  Most providers support this. When enabled, you only need the Issuer URL — all other endpoints are
                  detected automatically.
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
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
        <ClipboardCopy isReadOnly>{OIDC_REDIRECT_URI}</ClipboardCopy>
        <FormHelperText>
          <HelperText>
            <HelperTextItem>Copy this value into your identity provider's OAuth app configuration</HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>

      <Controller
        name="scopes"
        control={control}
        render={({ field, fieldState }) => {
          const scopesList = field.value ? field.value.split(/\s+/).filter(Boolean) : []
          return (
            <FormGroup label="Scopes" fieldId="scopes" isRequired>
              <TagInput
                id="scopes"
                value={scopesList}
                onChange={(arr) => field.onChange(arr.join(' '))}
                ariaLabel="Add scope"
                placeholder="openid"
                helperText={fieldState.error ? undefined : 'Type a scope and press Enter or comma to add'}
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
          )
        }}
      />
    </FormSection>
  )
}
