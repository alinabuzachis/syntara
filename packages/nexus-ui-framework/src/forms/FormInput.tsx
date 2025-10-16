import { Input as BaseInput } from '@base-ui-components/react'
import { useFormContext, type FieldPath, type FieldValues } from 'react-hook-form'
import { Input } from '../inputs/Input'
import { FormField } from './FormField'

export function FormInput<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>(props: { name: TName; label: string; description?: string } & BaseInput.Props) {
  const { name, label, description, ...inputProps } = props
  const {
    register,
    formState: { errors },
  } = useFormContext()
  return (
    <FormField name={name} label={label} description={description} error={errors[name]?.message as React.ReactNode}>
      <Input {...register(name)} {...inputProps} />
    </FormField>
  )
}
