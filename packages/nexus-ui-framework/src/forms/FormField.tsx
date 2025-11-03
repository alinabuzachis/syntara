import { Field } from '@base-ui-components/react'

export function FormField(props: {
  name: string
  label: string
  description?: string
  error?: React.ReactNode
  disabled?: boolean
  required?: boolean
  children?: React.ReactNode
}) {
  return (
    <Field.Root className="flex w-full flex-col items-start gap-1" name={props.name} disabled={props.disabled}>
      <Field.Label id={props.name + '-label'} className="text-white/60">
        {props.label}
        {props.required && <span className="ml-1 text-red-600">*</span>}
      </Field.Label>
      {props.children}
      <Field.Description className="text-sm text-gray-600">{props.description}</Field.Description>
      <Field.Error className="text-sm text-red-800" match="valueMissing">
        {props.error}
      </Field.Error>
      {/* <Field.Validity>
        {(validity) => {
          return <div>{validity.value ? "Valid" : "Invalid"}</div>;
        }}
      </Field.Validity> */}
    </Field.Root>
  )
}
