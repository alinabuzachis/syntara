import { useState } from 'react'

import type { FilterConfig } from '../../types/filters'

import type { LabelFilterProps } from './LabelFilter'
import { LabelFilter } from './LabelFilter'
import type { SelectFilterProps } from './SelectFilter'
import { SelectFilter } from './SelectFilter'
import type { TextFilterProps } from './TextFilter'
import { TextFilter } from './TextFilter'

/**
 * Test helper for controlled TextFilter
 */
export function ControlledTextFilter({
  onChange,
  initialValue,
  ...props
}: Omit<TextFilterProps, 'onChange'> & {
  onChange?: (filter: FilterConfig | null) => void
  initialValue?: string
}) {
  const [value, setValue] = useState(initialValue ?? '')

  return (
    <TextFilter
      {...props}
      value={value}
      onChange={(filter) => {
        onChange?.(filter)
        setValue(filter?.value ? String(filter.value) : '')
      }}
    />
  )
}

/**
 * Test helper for controlled SelectFilter
 */
export function ControlledSelectFilter({
  onChange,
  initialValue,
  ...props
}: Omit<SelectFilterProps, 'onChange'> & {
  onChange?: (filter: FilterConfig | null) => void
  initialValue?: string | string[]
}) {
  const [value, setValue] = useState<string | string[]>(initialValue ?? (props.isMulti ? [] : ''))

  return (
    <SelectFilter
      {...props}
      value={value}
      onChange={(filter) => {
        onChange?.(filter)
        if (props.isMulti) {
          setValue((filter?.value as string[]) ?? [])
        } else {
          setValue((filter?.value as string) ?? '')
        }
      }}
    />
  )
}

/**
 * Test helper for controlled LabelFilter
 */
export function ControlledLabelFilter({
  onChange,
  initialLabels,
  ...props
}: Omit<LabelFilterProps, 'onChange'> & {
  onChange?: (labelParams: Record<string, string>) => void
  initialLabels?: Record<string, string>
}) {
  const [rawLabelParams, setRawLabelParams] = useState<Record<string, string>>(() => {
    // Convert initial labels to label params format
    const params: Record<string, string> = {}
    Object.entries(initialLabels ?? {}).forEach(([key, value]) => {
      params[`labels[${key}]`] = value
    })
    return params
  })

  // Convert label params back to labels for the component
  const labels = Object.entries(rawLabelParams).reduce(
    (acc, [paramKey, value]) => {
      const match = paramKey.match(/^labels\[([^\]]+)\]$/)
      if (match) {
        acc[match[1]] = value
      }
      return acc
    },
    {} as Record<string, string>
  )

  return (
    <LabelFilter
      {...props}
      labels={labels}
      onChange={(labelParams) => {
        onChange?.(labelParams)
        // Store raw label params to preserve empty keys
        setRawLabelParams(labelParams)
      }}
    />
  )
}
