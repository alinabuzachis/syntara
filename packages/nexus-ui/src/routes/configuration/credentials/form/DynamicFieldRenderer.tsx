import {
  Button,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  InputGroup,
  InputGroupItem,
  Switch,
  TextArea,
  TextInput,
} from '@patternfly/react-core'
import { RhUiErrorIcon, RhUiViewIcon, RhUiViewOffIcon } from '@patternfly/react-icons'
import { useMemo, useState } from 'react'

import { FormLabelWithHelp } from '../../../../components/FormLabelWithHelp'
import { ENCRYPTED_SENTINEL } from '../credentialConstants'

export type FieldDefinition = {
  id: string
  label: string
  type: string
  secret?: boolean
  choices?: string[]
  help_text?: string
  placeholder?: string
  default?: unknown
  multiline?: boolean
}

type DynamicFieldRendererProps = {
  field: FieldDefinition
  value: unknown
  onChange: (fieldId: string, value: unknown) => void
  isRequired?: boolean
  isEditMode?: boolean
  error?: string
}

function FieldHelperText({ error, helpText }: Readonly<{ error?: string; helpText?: string }>) {
  if (error) {
    return (
      <FormHelperText>
        <HelperText>
          <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
            {error}
          </HelperTextItem>
        </HelperText>
      </FormHelperText>
    )
  }
  if (helpText) {
    return (
      <FormHelperText>
        <HelperText>
          <HelperTextItem>{helpText}</HelperTextItem>
        </HelperText>
      </FormHelperText>
    )
  }
  return null
}

type FieldWrapperProps = {
  field: FieldDefinition
  isRequired?: boolean
  error?: string
  children: React.ReactNode
}

function FieldWrapper({ field, isRequired, error, children }: Readonly<FieldWrapperProps>) {
  const fieldLabel = useMemo(() => {
    if (field.help_text) return <FormLabelWithHelp label={field.label} helpText={field.help_text} />
    return field.label
  }, [field.label, field.help_text])

  return (
    <FormGroup label={fieldLabel} isRequired={isRequired} fieldId={field.id}>
      {children}
      <FieldHelperText error={error} />
    </FormGroup>
  )
}

function BooleanField({ field, value, onChange, error }: DynamicFieldRendererProps) {
  return (
    <FieldWrapper field={field} error={error}>
      <Switch
        id={field.id}
        isChecked={value === true || value === 'true'}
        onChange={(_event, checked) => onChange(field.id, checked)}
        label="Enabled"
      />
    </FieldWrapper>
  )
}

function ChoicesField({ field, value, onChange, isRequired, error }: DynamicFieldRendererProps) {
  const stringValue = value != null ? String(value as string | number | boolean) : ''
  const validated = error ? 'error' : 'default'

  return (
    <FieldWrapper field={field} isRequired={isRequired} error={error}>
      <FormSelect
        id={field.id}
        value={stringValue}
        onChange={(_event, val) => onChange(field.id, val)}
        validated={validated}
        aria-label={field.label}
      >
        <FormSelectOption value="" label="Select..." isPlaceholder />
        {field.choices?.map((choice) => (
          <FormSelectOption key={choice} value={choice} label={choice} />
        ))}
      </FormSelect>
    </FieldWrapper>
  )
}

function MultilineField({ field, value, onChange, isRequired, error }: DynamicFieldRendererProps) {
  const stringValue = value != null ? String(value as string | number | boolean) : ''
  const validated = error ? 'error' : 'default'

  return (
    <FieldWrapper field={field} isRequired={isRequired} error={error}>
      <TextArea
        id={field.id}
        value={stringValue}
        onChange={(_event, val) => onChange(field.id, val)}
        validated={validated}
        rows={6}
        placeholder={field.placeholder ?? field.help_text}
        aria-label={field.label}
      />
    </FieldWrapper>
  )
}

function SecretField({ field, value, onChange, isRequired, isEditMode, error }: DynamicFieldRendererProps) {
  const [showSecret, setShowSecret] = useState(false)
  const [secretTouched, setSecretTouched] = useState(false)

  const stringValue = value != null ? String(value as string | number | boolean) : ''
  const isEncryptedPlaceholder = isEditMode && !secretTouched && stringValue === ENCRYPTED_SENTINEL
  const displayValue = isEncryptedPlaceholder ? '' : stringValue
  const validated = error ? 'error' : 'default'

  const handleSecretChange = (_event: React.FormEvent, val: string) => {
    if (!secretTouched) setSecretTouched(true)
    onChange(field.id, val)
  }

  return (
    <FieldWrapper field={field} isRequired={isRequired} error={error}>
      <InputGroup>
        <InputGroupItem isFill>
          <TextInput
            id={field.id}
            type={showSecret ? 'text' : 'password'}
            value={displayValue}
            onChange={handleSecretChange}
            validated={validated}
            placeholder={
              isEncryptedPlaceholder
                ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'
                : (field.placeholder ?? field.help_text)
            }
            aria-label={field.label}
          />
        </InputGroupItem>
        <InputGroupItem>
          <Button
            variant="control"
            onClick={() => setShowSecret(!showSecret)}
            aria-label={showSecret ? 'Hide secret' : 'Show secret'}
          >
            {showSecret ? <RhUiViewOffIcon /> : <RhUiViewIcon />}
          </Button>
        </InputGroupItem>
      </InputGroup>
    </FieldWrapper>
  )
}

function PlainTextField({ field, value, onChange, isRequired, error }: DynamicFieldRendererProps) {
  const stringValue = value != null ? String(value as string | number | boolean) : ''
  const validated = error ? 'error' : 'default'

  return (
    <FieldWrapper field={field} isRequired={isRequired} error={error}>
      <TextInput
        id={field.id}
        type="text"
        value={stringValue}
        onChange={(_event, val) => onChange(field.id, val)}
        validated={validated}
        placeholder={field.placeholder ?? field.help_text}
        aria-label={field.label}
      />
    </FieldWrapper>
  )
}

export function DynamicFieldRenderer(props: DynamicFieldRendererProps) {
  const { field } = props

  if (field.type === 'boolean') return <BooleanField {...props} />
  if (field.choices && field.choices.length > 0) return <ChoicesField {...props} />
  if (field.multiline) return <MultilineField {...props} />
  if (field.secret) return <SecretField {...props} />
  return <PlainTextField {...props} />
}
