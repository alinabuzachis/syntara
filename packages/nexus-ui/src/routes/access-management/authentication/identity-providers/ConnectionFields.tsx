import { FormGroup, FormHelperText, HelperText, HelperTextItem, Switch, TextInput } from '@patternfly/react-core'
import { Controller, type Control } from 'react-hook-form'

import { FieldErrorMessage, FieldHelpPopover, HintOrError } from './formFieldHelpers'
import { type IdentityProviderFormData } from './identityProviderFormSchema'
import { ManualEndpointFields } from './ManualEndpointFields'

export function ConnectionFields({
  control,
  autoDiscovery,
  isEdit,
}: Readonly<{ control: Control<IdentityProviderFormData>; autoDiscovery: boolean; isEdit?: boolean }>) {
  return (
    <>
      <Controller
        name="issuerUrl"
        control={control}
        render={({ field, fieldState }) => (
          <FormGroup
            label="Issuer URL"
            fieldId="issuer-url"
            isRequired
            labelHelp={
              <FieldHelpPopover helpText="The base URL of your OpenID Connect provider. Used to discover endpoints automatically." />
            }
          >
            <TextInput
              id="issuer-url"
              placeholder="https://accounts.google.com"
              validated={fieldState.error ? 'error' : 'default'}
              {...field}
            />
            <FieldErrorMessage error={fieldState.error} />
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
          <FormGroup
            label="Client ID"
            fieldId="client-id"
            isRequired
            labelHelp={
              <FieldHelpPopover helpText="The OAuth 2.0 client identifier registered with your identity provider." />
            }
          >
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
          <FormGroup
            label="Client secret"
            fieldId="client-secret"
            isRequired={!isEdit}
            labelHelp={
              <FieldHelpPopover helpText="The OAuth 2.0 client secret used to authenticate with the identity provider." />
            }
          >
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
    </>
  )
}
