import { Controller, useFormContext, type FieldPath, type FieldValues } from 'react-hook-form'

import { Select } from '../inputs/Select'

import { FormField } from './FormField'

export function FormSelect<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>(
  props: { name: TName; label: string; description?: string } & Omit<
    React.ComponentProps<typeof Select>,
    'value' | 'onValueChange'
  >
) {
  const { name, label, description, ...selectProps } = props
  const {
    control,
    formState: { errors },
  } = useFormContext()
  return (
    <FormField name={name} label={label} description={description} error={errors[name]?.message as React.ReactNode}>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Select {...selectProps} {...field} value={field.value} onValueChange={field.onChange} />
        )}
      />
    </FormField>
  )
}
