import { Alert, FormGroup, FormHelperText, HelperText, HelperTextItem, Switch, TextInput } from '@patternfly/react-core'
import { RhUiErrorIcon } from '@patternfly/react-icons'
import { Controller, type useForm } from 'react-hook-form'

import type { EditIntegrationFormValues } from './editIntegrationFormSchema'

export function AapConfigurationFields({
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
