import { FormGroup, StackItem, TextInput } from '@patternfly/react-core'
import type { Path, UseFormReturn } from 'react-hook-form'

interface ActivityNameFieldProps<T extends { name: string }> {
  register: UseFormReturn<T>['register']
  fieldId: string
  label?: string
  placeholder?: string
}

/**
 * Standardized "Activity Name" field used across most node forms.
 * Always required with consistent placeholder and styling.
 */
export function ActivityNameField<T extends { name: string }>({
  register,
  fieldId,
  label = 'Activity Name',
  placeholder = 'Enter activity name',
}: ActivityNameFieldProps<T>) {
  return (
    <StackItem>
      <FormGroup label={label} isRequired fieldId={fieldId}>
        <TextInput
          {...register('name' as Path<T>, { required: true })}
          id={fieldId}
          placeholder={placeholder}
          type="text"
        />
      </FormGroup>
    </StackItem>
  )
}
