import { Button, FormGroup, TextInput } from '@patternfly/react-core'
import { Controller, type Control } from 'react-hook-form'

import { HintOrError } from './formFieldHelpers'
import { type IdentityProviderFormData } from './identityProviderFormSchema'
import { IDP_TYPE_PRESETS } from './idpTypePresets'
import styles from './JmespathExpressionField.module.css'

export function JmespathExpressionField({
  control,
  idpType,
}: Readonly<{ control: Control<IdentityProviderFormData>; idpType?: string | null }>) {
  const defaultExpression = idpType ? (IDP_TYPE_PRESETS[idpType]?.groupMappingExpression ?? null) : null

  return (
    <Controller
      name="groupMapping.jmespathExpression"
      control={control}
      render={({ field, fieldState }) => {
        const currentValue = field.value ?? 'groups[*]'
        const showReset = defaultExpression && currentValue !== defaultExpression

        return (
          <FormGroup label="Group extraction expression" fieldId="jmespath-expression">
            <TextInput
              id="jmespath-expression"
              placeholder="groups[*]"
              validated={fieldState.error ? 'error' : 'default'}
              {...field}
              value={currentValue}
            />
            <HintOrError
              error={fieldState.error}
              hint="JMESPath expression to extract group values from the ID token. Pre-filled by provider template selection."
            />
            {showReset && (
              <Button variant="link" onClick={() => field.onChange(defaultExpression)} className={styles.resetButton}>
                Reset to default for {IDP_TYPE_PRESETS[idpType ?? '']?.label ?? 'this provider'}
              </Button>
            )}
          </FormGroup>
        )
      }}
    />
  )
}
