import { Field, Switch as BaseSwitch } from '@base-ui-components/react'
import { Switch } from '../inputs/Switch'
import { useFormContext, type FieldPath, type FieldValues } from 'react-hook-form'
import React from 'react'

export function FormSwitch<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>(
  props: {
    name: TName
    label: string
    description?: string
    handleChange: (checked: boolean) => void
  } & BaseSwitch.Root.Props
) {
  const { name, ...inputProps } = props

  const {
    register,
    formState: { errors },
  } = useFormContext()
  return (
    <Field.Root className="flex w-full items-start gap-1" name={props.name} disabled={props.disabled}>
      <Switch {...register(name)} {...inputProps} checked={props?.checked} handleChange={props?.handleChange} />
      <Field.Label id={props.name + '-label'} className="text-white/60">
        {props.label}
      </Field.Label>
      <Field.Description className="text-sm text-gray-600">{props.description}</Field.Description>
      <Field.Error className="text-sm text-red-800" match="valueMissing">
        {errors[name]?.message as React.ReactNode}
      </Field.Error>
    </Field.Root>
  )
}
