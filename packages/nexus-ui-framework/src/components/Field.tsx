import type { ReactNode } from 'react'

export interface FieldProps {
  label: string
  htmlFor?: string
  helpText?: string
  error?: string
  required?: boolean
  children: ReactNode
}

/**
 * Field wrapper component that provides consistent label, help text, and error message display.
 * Use this to wrap form inputs for consistent styling across node forms.
 */
export function Field(props: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={props.htmlFor} className="text-xs font-medium text-gray-300">
        {props.label}
        {props.required && <span className="ml-1 text-red-400">*</span>}
      </label>
      {props.children}
      {props.helpText && !props.error && <p className="text-xs text-gray-400">{props.helpText}</p>}
      {props.error && <p className="text-xs text-red-400">{props.error}</p>}
    </div>
  )
}
