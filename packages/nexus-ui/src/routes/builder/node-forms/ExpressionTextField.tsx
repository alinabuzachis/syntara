import { FormGroup, FormHelperText, HelperText, HelperTextItem, TextInput } from '@patternfly/react-core'
import type { FieldValues, Path } from 'react-hook-form'
import { useFormContext } from 'react-hook-form'

import { DroppableField } from '../panels/fields/DroppableField'

import type { AAPJobTemplateFormData } from './aapJobTemplateSchema'
import type { AAPWorkflowTemplateFormData } from './aapWorkflowTemplateSchema'

/**
 * Generic expression text field with drag-and-drop support.
 * Used for AAP job template and workflow template forms.
 */
type GenericExpressionTextFieldProps<T extends FieldValues> = {
  readonly name: Path<T>
  readonly id: string
  readonly label: string
  readonly placeholder: string
  readonly isRequired?: boolean
}

function GenericExpressionTextField<T extends FieldValues>({
  name,
  id,
  label,
  placeholder,
  isRequired,
}: GenericExpressionTextFieldProps<T>) {
  const { register, getValues, setValue } = useFormContext<T>()
  return (
    <FormGroup label={label} isRequired={isRequired} fieldId={id}>
      <DroppableField
        onDropText={(text) => {
          const current = getValues(name)
          // Type assertion needed for generic Path<T> with string concatenation
          setValue(name, (((current as string) ?? '') + text) as T[Path<T>])
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

/**
 * Expression text field for AAP job template forms.
 * Supports drag-and-drop expressions from the Input panel.
 */
export function ExpressionTextField(props: GenericExpressionTextFieldProps<AAPJobTemplateFormData>) {
  return <GenericExpressionTextField {...props} />
}

/**
 * Expression text field for AAP workflow template forms.
 * Supports drag-and-drop expressions from the Input panel.
 */
export function WorkflowExpressionTextField(props: GenericExpressionTextFieldProps<AAPWorkflowTemplateFormData>) {
  return <GenericExpressionTextField {...props} />
}
