import type React from 'react'
import { FormProvider, useForm, type DefaultValues, type FieldValues, type UseFormReturn } from 'react-hook-form'

type FormProps<TFieldValues extends FieldValues = FieldValues> = {
  id: string
  defaultValues?: DefaultValues<TFieldValues>
  onSubmit: (data: TFieldValues) => void | Promise<void>
  className?: string
} & (
  | {
      children: React.ReactNode
    }
  | {
      children: (methods: UseFormReturn<TFieldValues>) => React.ReactNode
    }
)

export function Form<TFieldValues extends FieldValues = FieldValues>(props: FormProps<TFieldValues>) {
  const methods = useForm<TFieldValues>({
    defaultValues: props.defaultValues,
  })
  return (
    <FormProvider {...methods}>
      <form
        id={props.id}
        onSubmit={methods.handleSubmit(props.onSubmit)}
        className={props?.className ? props.className : 'glass flex grow flex-col gap-4 rounded-4xl border p-8'}
      >
        {typeof props.children === 'function' ? props.children(methods) : props.children}
      </form>
    </FormProvider>
  )
}
