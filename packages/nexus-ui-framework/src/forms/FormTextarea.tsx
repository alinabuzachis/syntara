import { useFormContext, type FieldPath, type FieldValues } from 'react-hook-form'
import { Textarea } from '../inputs/Textarea'
import { FormField } from './FormField'
import type React from 'react'

export function FormTextarea<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>(props: { name: TName; label: string; description?: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { name, label, description, required, ...textareaProps } = props
  const {
    register,
    formState: { errors },
  } = useFormContext()

  return (
    <FormField
      name={name}
      label={label}
      description={description}
      required={required}
      error={errors[name]?.message as React.ReactNode}
    >
      <Textarea {...register(name)} required={required} {...textareaProps} />
    </FormField>
  )
}
