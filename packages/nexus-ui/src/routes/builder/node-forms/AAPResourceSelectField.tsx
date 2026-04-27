import { FormGroup, FormHelperText, HelperText, HelperTextItem, StackItem } from '@patternfly/react-core'
import { Controller, useFormContext } from 'react-hook-form'

import type { AAPFormData } from './aapFormSchema'
import { AAPTypeaheadSelect } from './AAPTypeaheadSelect'

type AAPResourceItem = {
  readonly id: number
  readonly name: string
}

type AAPResourceSelectFieldProps = {
  readonly label: string
  readonly fieldId: string
  readonly nameField: keyof AAPFormData
  readonly idField: keyof AAPFormData
  readonly items: readonly AAPResourceItem[]
  readonly isLoading: boolean
  readonly helperText: string
  readonly placeholderText: string
  readonly onSearchChange: (search: string) => void
}

export function AAPResourceSelectField({
  label,
  fieldId,
  nameField,
  idField,
  items,
  isLoading,
  helperText,
  placeholderText,
  onSearchChange,
}: AAPResourceSelectFieldProps) {
  const { control, setValue } = useFormContext<AAPFormData>()
  const options = items.map((item) => ({ value: String(item.id), label: item.name }))

  return (
    <StackItem>
      <FormGroup label={label} fieldId={fieldId}>
        <Controller
          control={control}
          name={nameField}
          render={({ field }) => {
            // Find the item by ID from the current field value (which stores the name)
            // When the user selects, we'll update both name and ID
            const selectedItem = items.find((item) => item.name === field.value)
            const selectedId = selectedItem ? String(selectedItem.id) : ''

            return (
              <AAPTypeaheadSelect
                id={fieldId}
                ariaLabel={label}
                options={options}
                selected={selectedId}
                onChange={(value) => {
                  // value is now the item.id (as string)
                  const selectedItem = items.find((item) => String(item.id) === value)
                  if (selectedItem) {
                    field.onChange(selectedItem.name)
                    setValue(idField, selectedItem.id)
                  } else {
                    // Clear both on empty selection
                    field.onChange('')
                    setValue(idField, undefined)
                  }
                }}
                onSearchChange={onSearchChange}
                placeholder={placeholderText}
                isLoading={isLoading}
              />
            )
          }}
        />
        <FormHelperText>
          <HelperText>
            <HelperTextItem>{helperText}</HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>
    </StackItem>
  )
}
