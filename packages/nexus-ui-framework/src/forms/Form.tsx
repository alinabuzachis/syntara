import type React from 'react'
import { FormProvider, useForm, type DefaultValues, type FieldValues } from 'react-hook-form'

export function Form<TFieldValues extends FieldValues = FieldValues>(props: {
  id: string
  children: React.ReactNode
  defaultValues?: DefaultValues<TFieldValues>
  onSubmit: (data: TFieldValues) => void | Promise<void>
}) {
  const methods = useForm<TFieldValues>({
    defaultValues: props.defaultValues,
  })
  return (
    <FormProvider {...methods}>
      <form
        id={props.id}
        onSubmit={methods.handleSubmit(props.onSubmit)}
        className="glass flex grow flex-col gap-4 rounded-4xl border p-8"
      >
        {props.children}
      </form>
    </FormProvider>
  )
}
