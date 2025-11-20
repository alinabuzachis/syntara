import { Radio, RadioGroup } from '@base-ui-components/react'
import clsx from 'clsx'
import { Controller, useFormContext, type FieldPath, type FieldValues } from 'react-hook-form'

import { FormField } from './FormField'

type FormButtonGroupProps<TFieldValues extends FieldValues> = {
  name: FieldPath<TFieldValues>
  label: string
  options: { label: string; value: string; icon?: React.ReactNode }[]
  description?: string
  disabled?: boolean
}

export function FormButtonGroup<TFieldValues extends FieldValues>(props: FormButtonGroupProps<TFieldValues>) {
  const { control } = useFormContext()

  return (
    <Controller
      name={props.name}
      control={control}
      render={({ field }) => (
        <FormField name={props.name} label={props.label} description={props.description} disabled={props.disabled}>
          <RadioGroup
            className="mt-2 flex flex-wrap gap-3"
            value={field.value}
            onValueChange={(value) => field.onChange(value)}
            disabled={props.disabled}
            aria-labelledby={`${props.name}-label`}
          >
            {props.options.map((option) => (
              <Radio.Root
                key={option.value}
                value={option.value}
                aria-label={option.label}
                className={clsx(
                  'flex min-w-[220px] cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 px-6 py-3 transition-all',
                  'hover:border-blue-400 hover:bg-blue-500/10',
                  'focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:outline-none',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  'data-[checked]:border-blue-500 data-[checked]:bg-blue-500/20',
                  'data-[unchecked]:border-gray-600 data-[unchecked]:bg-gray-800/50'
                )}
              >
                {option.icon && <span className="text-3xl">{option.icon}</span>}
                <span className="text-center text-sm text-white">{option.label}</span>
              </Radio.Root>
            ))}
          </RadioGroup>
        </FormField>
      )}
    />
  )
}
