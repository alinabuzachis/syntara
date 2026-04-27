import type { SettingsAPI } from '@ansible/nexus-contracts'
import {
  Button,
  FormSelect,
  FormSelectOption,
  Label,
  LabelGroup,
  NumberInput,
  Switch,
  TextInput,
  TextInputGroup,
  TextInputGroupMain,
  TextInputGroupUtilities,
} from '@patternfly/react-core'
import { TimesIcon } from '@patternfly/react-icons'
import { useEffect, useState } from 'react'
import { z } from 'zod'

type RuntimeSetting = SettingsAPI.components['schemas']['RuntimeSettingRead']

type NumericBounds = {
  min: number | undefined
  max: number | undefined
}

type SettingInputProps = {
  readonly setting: RuntimeSetting
  readonly value: unknown
  readonly numericBounds: NumericBounds | null
  readonly numericError: string | null
  readonly onChange: (key: string, value: unknown) => void
  readonly stringError: string | null
  readonly onStringError: (error: string | null) => void
}

const emailSchema = z.email({ error: 'Invalid email address' })
const urlSchema = z
  .url({ error: 'Must be a valid URL' })
  .refine((url) => /^https?:\/\//i.test(url), { message: 'Must be an HTTP or HTTPS URL' })

export function SettingInput({
  setting,
  value,
  numericBounds,
  numericError,
  onChange,
  stringError,
  onStringError,
}: SettingInputProps) {
  const [jsonInputValue, setJsonInputValue] = useState('')
  const schema = (setting.validation_schema ?? {}) as Record<string, unknown>
  const pattern = schema.pattern as string | undefined

  // Validate string patterns on mount/value change so errors survive tab switches
  useEffect(() => {
    if (setting.value_type !== 'string' || !pattern) return
    const val = (value as string) ?? ''
    if (!val) {
      if (stringError) onStringError(null)
      return
    }
    if (pattern === 'url') {
      const result = urlSchema.safeParse(val)
      onStringError(result.success ? null : result.error.issues[0].message)
    } else if (pattern === 'email') {
      const result = emailSchema.safeParse(val)
      onStringError(result.success ? null : result.error.issues[0].message)
    }
  }, [value, setting.value_type, pattern, onStringError, stringError])

  switch (setting.value_type) {
    case 'boolean':
      return (
        <Switch
          id={setting.key}
          label={value ? 'Enabled' : 'Disabled'}
          isChecked={value as boolean}
          onChange={(_event, checked) => onChange(setting.key, checked)}
        />
      )

    case 'integer':
    case 'float': {
      const numValue = (value as number) ?? 0
      const min = numericBounds?.min
      const max = numericBounds?.max
      const step = setting.value_type === 'float' ? 0.1 : 1

      const handleBlur = () => {
        let snapped = numValue
        if (min !== undefined && snapped < min) snapped = min
        if (max !== undefined && snapped > max) snapped = max
        if (snapped !== numValue) onChange(setting.key, snapped)
      }

      return (
        <NumberInput
          id={setting.key}
          value={numValue}
          min={min}
          max={max}
          validated={numericError ? 'error' : 'default'}
          onMinus={() => onChange(setting.key, Math.round((numValue - step) * 100) / 100)}
          onPlus={() => onChange(setting.key, Math.round((numValue + step) * 100) / 100)}
          onBlur={handleBlur}
          onChange={(event) => {
            const target = event.target as HTMLInputElement
            const parsed =
              setting.value_type === 'float' ? Number.parseFloat(target.value) : Number.parseInt(target.value, 10)
            if (!Number.isNaN(parsed)) onChange(setting.key, parsed)
          }}
        />
      )
    }

    case 'string': {
      const allowedValues = schema.allowed_values as string[] | undefined
      if (allowedValues) {
        return (
          <FormSelect id={setting.key} value={value as string} onChange={(_event, val) => onChange(setting.key, val)}>
            {allowedValues.map((v) => (
              <FormSelectOption key={v} value={v} label={v} />
            ))}
          </FormSelect>
        )
      }
      return (
        <TextInput
          id={setting.key}
          value={(value as string) ?? ''}
          validated={stringError ? 'error' : 'default'}
          onChange={(_event, val) => onChange(setting.key, val)}
        />
      )
    }

    case 'json': {
      const items = Array.isArray(value) ? (value as string[]).filter(Boolean) : []
      return (
        <TextInputGroup>
          <TextInputGroupMain
            id={setting.key}
            value={jsonInputValue}
            onChange={(_event, val) => {
              if (stringError) onStringError(null)
              setJsonInputValue(val)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                const trimmed = jsonInputValue.trim()
                if (!trimmed) return
                if (pattern === 'email') {
                  const result = emailSchema.safeParse(trimmed)
                  if (!result.success) {
                    onStringError(result.error.issues[0].message)
                    return
                  }
                }
                if (stringError) onStringError(null)
                if (!items.includes(trimmed)) {
                  onChange(setting.key, [...items, trimmed])
                  setJsonInputValue('')
                }
              }
            }}
            placeholder="Type a value and press Enter"
          >
            {items.length > 0 && (
              <LabelGroup aria-label={setting.name}>
                {items.map((item) => (
                  <Label
                    key={item}
                    onClose={() =>
                      onChange(
                        setting.key,
                        items.filter((i) => i !== item)
                      )
                    }
                  >
                    {item}
                  </Label>
                ))}
              </LabelGroup>
            )}
          </TextInputGroupMain>
          {items.length > 0 && (
            <TextInputGroupUtilities>
              <Button
                variant="plain"
                aria-label="Clear all"
                onClick={() => {
                  onChange(setting.key, [])
                  setJsonInputValue('')
                }}
              >
                <TimesIcon />
              </Button>
            </TextInputGroupUtilities>
          )}
        </TextInputGroup>
      )
    }

    default:
      return (
        <TextInput
          id={setting.key}
          value={String(value as string)}
          onChange={(_event, val) => onChange(setting.key, val)}
        />
      )
  }
}
