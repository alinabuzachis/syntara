import { Field as BaseField } from '@base-ui-components/react'

export function Field(props: {
  name: string
  label: string
  description?: string
  error?: React.ReactNode
  disabled?: boolean
  children?: React.ReactNode
}) {
  return (
    <BaseField.Root className="flex w-full flex-col items-start gap-1" name={props.name} disabled={props.disabled}>
      <BaseField.Label id={props.name + '-label'} className="text-white/60">
        {props.label}
      </BaseField.Label>
      {props.children}
      <BaseField.Description className="text-sm text-gray-600">{props.description}</BaseField.Description>
      <BaseField.Error className="text-sm text-red-800" match="valueMissing">
        {props.error}
      </BaseField.Error>
      {/* <Field.Validity>
        {(validity) => {
          return <div>{validity.value ? "Valid" : "Invalid"}</div>;
        }}
      </Field.Validity> */}
    </BaseField.Root>
  )
}
