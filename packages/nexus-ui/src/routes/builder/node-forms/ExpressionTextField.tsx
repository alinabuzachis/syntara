import { FormGroup, FormHelperText, HelperText, HelperTextItem, TextInput } from '@patternfly/react-core'
import { useFormContext } from 'react-hook-form'

import { DroppableField } from '../panels/fields/DroppableField'

import type { AAPFormData } from './aapFormSchema'

type ExpressionTextFieldProps = {
  readonly name: keyof AAPFormData
  readonly id: string
  readonly label: string
  readonly placeholder: string
  readonly isRequired?: boolean
}

export function ExpressionTextField({ name, id, label, placeholder, isRequired }: ExpressionTextFieldProps) {
  const { register, getValues, setValue } = useFormContext<AAPFormData>()
  return (
    <FormGroup label={label} isRequired={isRequired} fieldId={id}>
      <DroppableField
        onDropText={(text) => {
          const current = getValues(name)
          setValue(name, ((current as string) ?? '') + text)
        }}
      >
        <TextInput {...register(name)} id={id} type="text" placeholder={placeholder} />
      </DroppableField>
      <FormHelperText>
        <HelperText>
          <HelperTextItem>Enter a value or drag an expression from the Input panel</HelperTextItem>
        </HelperText>
      </FormHelperText>
    </FormGroup>
  )
}
