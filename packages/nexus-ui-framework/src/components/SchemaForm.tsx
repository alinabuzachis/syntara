import { useState } from 'react'

import { Input } from '../inputs/Input'
import { Textarea } from '../inputs/Textarea'

import { Button } from './Button'
import { Checkbox } from './Checkbox'
import { Field } from './Field'
import { NativeSelect } from './NativeSelect'

export type FieldType = 'text' | 'number' | 'email' | 'url' | 'select' | 'textarea' | 'checkbox'

export interface FieldCondition {
  field: string
  value: unknown
}

export interface BaseFieldSchema {
  name: string
  label: string
  type: FieldType
  required?: boolean
  placeholder?: string
  helpText?: string
  defaultValue?: unknown
  condition?: FieldCondition
}

export interface TextFieldSchema extends BaseFieldSchema {
  type: 'text' | 'email' | 'url'
}

export interface NumberFieldSchema extends BaseFieldSchema {
  type: 'number'
  min?: number
  max?: number
  defaultValue?: number
}

export interface SelectFieldSchema extends BaseFieldSchema {
  type: 'select'
  options: Array<{ label: string; value: string }>
  defaultValue?: string
}

export interface TextareaFieldSchema extends BaseFieldSchema {
  type: 'textarea'
  rows?: number
  monospace?: boolean
}

export interface CheckboxFieldSchema extends BaseFieldSchema {
  type: 'checkbox'
  defaultValue?: boolean
}

export type FieldSchema =
  | TextFieldSchema
  | NumberFieldSchema
  | SelectFieldSchema
  | TextareaFieldSchema
  | CheckboxFieldSchema

export interface SchemaFormProps {
  fields: FieldSchema[]
  submitLabel: string
  onSubmit: (data: Record<string, unknown>) => void
  onCancel?: () => void
}

/**
 * A schema-driven form component that automatically renders form fields
 * based on a field schema definition. Supports conditional field rendering,
 * validation, and various input types.
 *
 * @example
 * ```tsx
 * <SchemaForm
 *   fields={[
 *     { type: 'text', name: 'name', label: 'Activity Name', required: true },
 *     { type: 'select', name: 'type', label: 'Type', options: [...] },
 *     {
 *       type: 'text',
 *       name: 'url',
 *       label: 'URL',
 *       condition: { field: 'type', value: 'api' }
 *     },
 *   ]}
 *   submitLabel="Add Task"
 *   onSubmit={(data) => console.log(data)}
 * />
 * ```
 */
export function SchemaForm(props: SchemaFormProps) {
  const [formData, setFormData] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {}
    props.fields.forEach((field) => {
      if (field.defaultValue !== undefined) {
        initial[field.name] = field.defaultValue
      } else if (field.type === 'checkbox') {
        initial[field.name] = false
      } else if (field.type === 'number') {
        initial[field.name] = 0
      } else {
        initial[field.name] = ''
      }
    })
    return initial
  })

  const handleChange = (name: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    props.onSubmit(formData)
  }

  const isFieldVisible = (field: FieldSchema): boolean => {
    if (!field.condition) return true
    return formData[field.condition.field] === field.condition.value
  }

  const renderField = (field: FieldSchema) => {
    if (!isFieldVisible(field)) return null

    switch (field.type) {
      case 'text':
      case 'email':
      case 'url':
        return (
          <Field key={field.name} label={field.label} required={field.required} helpText={field.helpText}>
            <Input
              type={field.type}
              value={String(formData[field.name] || '')}
              onChange={(e) => handleChange(field.name, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
            />
          </Field>
        )

      case 'number': {
        const numberField = field as NumberFieldSchema
        return (
          <Field key={field.name} label={field.label} required={field.required} helpText={field.helpText}>
            <Input
              type="number"
              value={String(formData[field.name] || '')}
              onChange={(e) => handleChange(field.name, Number(e.target.value))}
              placeholder={field.placeholder}
              required={field.required}
              min={numberField.min}
              max={numberField.max}
            />
          </Field>
        )
      }

      case 'select': {
        const selectField = field as SelectFieldSchema
        return (
          <Field key={field.name} label={field.label} required={field.required} helpText={field.helpText}>
            <NativeSelect
              value={String(formData[field.name] || '')}
              onChange={(e) => handleChange(field.name, e.target.value)}
              required={field.required}
            >
              {selectField.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
        )
      }

      case 'textarea': {
        const textareaField = field as TextareaFieldSchema
        return (
          <Field key={field.name} label={field.label} required={field.required} helpText={field.helpText}>
            <Textarea
              value={String(formData[field.name] || '')}
              onChange={(e) => handleChange(field.name, e.target.value)}
              placeholder={field.placeholder}
              rows={textareaField.rows || 3}
              required={field.required}
              className={textareaField.monospace ? 'font-mono' : ''}
            />
          </Field>
        )
      }

      case 'checkbox': {
        return (
          <div key={field.name} className="flex items-center gap-2">
            <Checkbox
              id={field.name}
              checked={Boolean(formData[field.name])}
              onCheckedChange={(checked) => handleChange(field.name, checked)}
            />
            <label htmlFor={field.name} className="text-xs text-gray-300">
              {field.label}
            </label>
          </div>
        )
      }

      default:
        return null
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {props.fields.map(renderField)}
      <Button type="submit" variant="primary" className="w-full text-xs">
        {props.submitLabel}
      </Button>
    </form>
  )
}
