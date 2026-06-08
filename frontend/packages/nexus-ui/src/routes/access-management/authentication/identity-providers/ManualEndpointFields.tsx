import { FormGroup, TextInput } from '@patternfly/react-core'
import { Controller, type Control } from 'react-hook-form'

import { FieldErrorMessage, FieldHelpPopover } from './formFieldHelpers'
import { type IdentityProviderFormData } from './identityProviderFormSchema'

export function ManualEndpointFields({ control }: Readonly<{ control: Control<IdentityProviderFormData> }>) {
  return (
    <>
      <Controller
        name="authorizationEndpoint"
        control={control}
        render={({ field, fieldState }) => (
          <FormGroup
            label="Authorization endpoint"
            fieldId="authorization-endpoint"
            isRequired
            labelHelp={
              <FieldHelpPopover helpText="URL where users are redirected to authenticate with the identity provider." />
            }
          >
            <TextInput
              id="authorization-endpoint"
              placeholder="https://provider.com/oauth2/authorize"
              validated={fieldState.error ? 'error' : 'default'}
              {...field}
            />
            <FieldErrorMessage error={fieldState.error} />
          </FormGroup>
        )}
      />
      <Controller
        name="tokenEndpoint"
        control={control}
        render={({ field, fieldState }) => (
          <FormGroup
            label="Token endpoint"
            fieldId="token-endpoint"
            isRequired
            labelHelp={<FieldHelpPopover helpText="URL where authorization codes are exchanged for tokens." />}
          >
            <TextInput
              id="token-endpoint"
              placeholder="https://provider.com/oauth2/token"
              validated={fieldState.error ? 'error' : 'default'}
              {...field}
            />
            <FieldErrorMessage error={fieldState.error} />
          </FormGroup>
        )}
      />
      <Controller
        name="jwksUri"
        control={control}
        render={({ field, fieldState }) => (
          <FormGroup
            label="JWKS URI"
            fieldId="jwks-uri"
            isRequired
            labelHelp={<FieldHelpPopover helpText="URL to fetch public keys for token signature verification." />}
          >
            <TextInput
              id="jwks-uri"
              placeholder="https://provider.com/oauth2/keys"
              validated={fieldState.error ? 'error' : 'default'}
              {...field}
            />
            <FieldErrorMessage error={fieldState.error} />
          </FormGroup>
        )}
      />
      <Controller
        name="userinfoEndpoint"
        control={control}
        render={({ field, fieldState }) => (
          <FormGroup
            label="Userinfo endpoint"
            fieldId="userinfo-endpoint"
            labelHelp={<FieldHelpPopover helpText="URL to fetch additional user claims (optional)." />}
          >
            <TextInput
              id="userinfo-endpoint"
              placeholder="https://provider.com/oauth2/userinfo"
              validated={fieldState.error ? 'error' : 'default'}
              {...field}
            />
            <FieldErrorMessage error={fieldState.error} />
          </FormGroup>
        )}
      />
      <Controller
        name="endSessionEndpoint"
        control={control}
        render={({ field, fieldState }) => (
          <FormGroup
            label="End session endpoint"
            fieldId="end-session-endpoint"
            labelHelp={
              <FieldHelpPopover helpText="URL for single logout — users are redirected here on sign-out (optional)." />
            }
          >
            <TextInput
              id="end-session-endpoint"
              placeholder="https://provider.com/oauth2/logout"
              validated={fieldState.error ? 'error' : 'default'}
              {...field}
            />
            <FieldErrorMessage error={fieldState.error} />
          </FormGroup>
        )}
      />
    </>
  )
}
