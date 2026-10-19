import {
  Button,
  FormGroup,
  HelperText,
  HelperTextItem,
  Popover,
  Stack,
  StackItem,
  TextArea,
  TextInput,
} from '@patternfly/react-core'
import type { ReactElement } from 'react'
import { useState } from 'react'

import { ExpressionFormField } from '../panels/fields/ExpressionFormField'

import type { InvocationInputField } from './invocationSchemaUtils'

export type InputMappingFieldsProps = {
  fields: InvocationInputField[]
  values: Record<string, unknown>
  onChange: (values: Record<string, unknown>) => void
  variableOptions: VariableOption[]
  freeformJson: string
  onFreeformJsonChange: (value: string) => void
  isDisabled?: boolean
  labelHelp?: ReactElement
  error?: string
}

export type VariableOption = {
  label: string
  expression: string
}

function VariablePickerBody({
  options,
  onSelect,
}: Readonly<{ options: VariableOption[]; onSelect: (expression: string) => void }>) {
  if (options.length === 0) {
    return (
      <HelperText>
        <HelperTextItem>No parent workflow variables are available.</HelperTextItem>
      </HelperText>
    )
  }

  return (
    <Stack>
      {options.map((option) => (
        <StackItem key={option.expression}>
          <Button variant="link" type="button" onClick={() => onSelect(option.expression)}>
            {option.label}
          </Button>
        </StackItem>
      ))}
    </Stack>
  )
}

function VariablePicker({
  label,
  options,
  onSelect,
  isDisabled,
}: Readonly<{
  label: string
  options: VariableOption[]
  onSelect: (expression: string) => void
  isDisabled: boolean
}>) {
  const [isOpen, setIsOpen] = useState(false)
  const bodyContent = (
    <VariablePickerBody
      options={options}
      onSelect={(expression) => {
        onSelect(expression)
        setIsOpen(false)
      }}
    />
  )

  return (
    <Popover
      isVisible={isOpen}
      onHide={() => setIsOpen(false)}
      headerContent="Insert variable"
      bodyContent={bodyContent}
      aria-label={`Insert variable for ${label}`}
      triggerAction="click"
    >
      <Button
        variant="link"
        type="button"
        isDisabled={isDisabled}
        aria-expanded={isOpen}
        onClick={() => setIsOpen(true)}
      >
        Insert variable
      </Button>
    </Popover>
  )
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === undefined || value === null) return ''
  return JSON.stringify(value)
}

function updateValue(values: Record<string, unknown>, name: string, value: string) {
  return { ...values, [name]: value }
}

function renderSchemaInputField(
  field: InvocationInputField,
  index: number,
  context: {
    values: Record<string, unknown>
    onChange: (values: Record<string, unknown>) => void
    variableOptions: VariableOption[]
    isDisabled: boolean
  }
): ReactElement {
  const { values, onChange, variableOptions, isDisabled } = context
  const value = formatValue(Object.hasOwn(values, field.name) ? values[field.name] : field.defaultValue)
  const fieldId = `child-input-${index}`
  const help = field.description ? (
    <HelperText>
      <HelperTextItem>{field.description}</HelperTextItem>
    </HelperText>
  ) : undefined

  if (field.type === 'object' || field.type === 'array') {
    return (
      <StackItem key={field.name}>
        <FormGroup label={field.name} isRequired={field.required} fieldId={fieldId}>
          {help}
          <TextArea
            id={fieldId}
            aria-label={field.name}
            value={value}
            onChange={(_event, nextValue) => onChange(updateValue(values, field.name, nextValue))}
            isRequired={field.required}
            isDisabled={isDisabled}
            validated="default"
            resizeOrientation="vertical"
            placeholder={field.type === 'array' ? '[] or ${ expression }' : '{} or ${ expression }'}
          />
          <VariablePicker
            label={field.name}
            options={variableOptions}
            onSelect={(expression) => onChange(updateValue(values, field.name, expression))}
            isDisabled={isDisabled}
          />
        </FormGroup>
      </StackItem>
    )
  }

  if (field.type === 'string') {
    return (
      <StackItem key={field.name}>
        <ExpressionFormField
          id={fieldId}
          label={field.name}
          value={value}
          onChange={(nextValue) => onChange(updateValue(values, field.name, nextValue))}
          placeholder="Value or ${ expression }"
          isRequired={field.required}
          isDisabled={isDisabled}
          hint={field.description}
        />
        <VariablePicker
          label={field.name}
          options={variableOptions}
          onSelect={(expression) => onChange(updateValue(values, field.name, `${value}${expression}`))}
          isDisabled={isDisabled}
        />
      </StackItem>
    )
  }

  return (
    <StackItem key={field.name}>
      <FormGroup label={field.name} isRequired={field.required} fieldId={fieldId}>
        {help}
        <TextInput
          id={fieldId}
          aria-label={field.name}
          value={value}
          onChange={(_event, nextValue) => onChange(updateValue(values, field.name, nextValue))}
          isRequired={field.required}
          isDisabled={isDisabled}
          validated="default"
          placeholder={`${field.type} value or \${ expression }`}
        />
        <VariablePicker
          label={field.name}
          options={variableOptions}
          onSelect={(expression) => onChange(updateValue(values, field.name, expression))}
          isDisabled={isDisabled}
        />
      </FormGroup>
    </StackItem>
  )
}

/** Schema-driven values for child workflow inputs, with a JSON fallback when no schema is declared. */
function InputMappingFields({
  fields,
  values,
  onChange,
  variableOptions,
  freeformJson,
  onFreeformJsonChange,
  isDisabled = false,
  labelHelp,
  error,
}: Readonly<InputMappingFieldsProps>) {
  if (fields.length === 0) {
    return (
      <FormGroup label="Input Mapping (JSON)" labelHelp={labelHelp} fieldId="input-mapping-json">
        <TextArea
          id="input-mapping-json"
          aria-label="Input Mapping JSON"
          value={freeformJson}
          onChange={(_event, value) => onFreeformJsonChange(value)}
          isDisabled={isDisabled}
          validated={error ? 'error' : 'default'}
          resizeOrientation="vertical"
        />
        <HelperText>
          <HelperTextItem variant={error ? 'error' : 'default'}>
            {error ?? 'Enter a JSON object with child input values.'}
          </HelperTextItem>
        </HelperText>
      </FormGroup>
    )
  }

  return (
    <Stack hasGutter>
      <StackItem>
        <FormGroup label="Input Mapping" labelHelp={labelHelp}>
          <HelperText>
            <HelperTextItem variant={error ? 'error' : 'default'}>
              {error ?? 'Set a value for each child input. Use a template expression to reference parent data.'}
            </HelperTextItem>
          </HelperText>
        </FormGroup>
      </StackItem>
      {fields.map((field, index) =>
        renderSchemaInputField(field, index, { values, onChange, variableOptions, isDisabled })
      )}
    </Stack>
  )
}

export { InputMappingFields }
