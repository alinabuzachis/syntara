/**
 * Individual field components for AAP prompt-on-launch fields.
 * Extracted from AAPPromptOnLaunchFields.tsx to keep file size under 500 lines.
 */
import {
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  StackItem,
  Switch,
  TextInput,
} from '@patternfly/react-core'
import { RhUiErrorIcon } from '@patternfly/react-icons'
import { Controller, useFormContext } from 'react-hook-form'

import { TagInput } from '../../../components/forms/TagInput'
import { ExpandableCodeEditor, type ExpandableCodeEditorHandle } from '../components/ExpandableCodeEditor'

import type { AAPJobTemplateFormData } from './aapJobTemplateSchema'

// ── Run Type Field ──────────────────────────────────────────────────────

export function RunTypeField() {
  const { control } = useFormContext<AAPJobTemplateFormData>()

  return (
    <StackItem>
      <FormGroup label="Run type" fieldId="aap-jobType">
        <Controller
          control={control}
          name="job_type"
          render={({ field }) => (
            <FormSelect
              id="aap-jobType"
              value={field.value ?? ''}
              onChange={(_event, value) => field.onChange(value)}
              aria-label="Run type"
            >
              <FormSelectOption value="" label="[ run type ]" isPlaceholder />
              <FormSelectOption value="run" label="Run" />
              <FormSelectOption value="check" label="Check (Dry Run)" />
            </FormSelect>
          )}
        />
      </FormGroup>
    </StackItem>
  )
}

// ── Verbosity Field ─────────────────────────────────────────────────────

export function VerbosityField() {
  const { control } = useFormContext<AAPJobTemplateFormData>()

  return (
    <StackItem>
      <FormGroup label="Verbosity" fieldId="aap-verbosity">
        <Controller
          control={control}
          name="verbosity"
          render={({ field }) => (
            <FormSelect
              id="aap-verbosity"
              value={field.value ?? ''}
              onChange={(_event, value) => field.onChange(value)}
              aria-label="Verbosity"
            >
              <FormSelectOption value="" label="[ verbosity ]" isPlaceholder />
              <FormSelectOption value="0" label="0 - Normal" />
              <FormSelectOption value="1" label="1 - Verbose" />
              <FormSelectOption value="2" label="2 - More Verbose" />
              <FormSelectOption value="3" label="3 - Debug" />
              <FormSelectOption value="4" label="4 - Connection Debug" />
              <FormSelectOption value="5" label="5 - WinRM Debug" />
            </FormSelect>
          )}
        />
      </FormGroup>
    </StackItem>
  )
}

// ── Diff Mode Field ─────────────────────────────────────────────────────

export function DiffModeField() {
  const { control } = useFormContext<AAPJobTemplateFormData>()

  return (
    <StackItem>
      <Controller
        control={control}
        name="diff_mode"
        render={({ field }) => (
          <Switch
            id="aap-diffMode"
            label="Show changes"
            isChecked={field.value ?? false}
            onChange={(_event, checked) => field.onChange(checked)}
            aria-label="Show changes"
          />
        )}
      />
    </StackItem>
  )
}

// ── Extra Variables Field ───────────────────────────────────────────────

export type ExtraVariablesFieldProps = {
  readonly editorRef: React.RefObject<ExpandableCodeEditorHandle | null>
}

export function ExtraVariablesField({ editorRef }: ExtraVariablesFieldProps) {
  const {
    control,
    formState: { errors },
  } = useFormContext<AAPJobTemplateFormData>()
  const extraVarsMessage = errors.extra_vars?.message

  return (
    <StackItem>
      <FormGroup label="Extra variables" fieldId="aap-extra_vars">
        <Controller
          control={control}
          name="extra_vars"
          render={({ field }) => (
            <div className={extraVarsMessage ? 'pf-v6-c-form-control pf-m-error' : undefined}>
              <ExpandableCodeEditor
                ref={editorRef}
                code={field.value ?? ''}
                onCodeChange={field.onChange}
                onBlur={field.onBlur}
                language="json"
                height="150px"
                modalTitle="Edit extra variables"
                ariaLabel="Extra Variables"
              />
            </div>
          )}
        />
        {extraVarsMessage && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                {extraVarsMessage}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>
    </StackItem>
  )
}

// ── Text Input Field ────────────────────────────────────────────────────

export type TextInputFieldProps = {
  readonly label: string
  readonly fieldId: string
  readonly name: keyof AAPJobTemplateFormData
}

export function TextInputField({ label, fieldId, name }: TextInputFieldProps) {
  const { register } = useFormContext<AAPJobTemplateFormData>()

  return (
    <StackItem>
      <FormGroup label={label} fieldId={fieldId}>
        <TextInput {...register(name)} id={fieldId} type="text" />
      </FormGroup>
    </StackItem>
  )
}

// ── Number Input Field ──────────────────────────────────────────────────

export type NumberInputFieldProps = {
  readonly label: string
  readonly fieldId: string
  readonly name: keyof AAPJobTemplateFormData
  readonly placeholder: string
  readonly min: number
}

export function NumberInputField({ label, fieldId, name, placeholder, min }: NumberInputFieldProps) {
  const { register } = useFormContext<AAPJobTemplateFormData>()

  return (
    <StackItem>
      <FormGroup label={label} fieldId={fieldId}>
        <TextInput
          {...register(name, { valueAsNumber: true })}
          id={fieldId}
          type="number"
          placeholder={placeholder}
          min={min}
        />
      </FormGroup>
    </StackItem>
  )
}

// ── Tag Input Field ─────────────────────────────────────────────────────

export type TagInputFieldProps = {
  readonly label: string
  readonly fieldId: string
  readonly name: keyof AAPJobTemplateFormData
  readonly placeholder: string
  readonly helperText: string
}

export function TagInputField({ label, fieldId, name, placeholder, helperText }: TagInputFieldProps) {
  const { control } = useFormContext<AAPJobTemplateFormData>()

  return (
    <StackItem>
      <FormGroup label={label} fieldId={fieldId}>
        <Controller
          control={control}
          name={name}
          render={({ field }) => {
            const items =
              typeof field.value === 'string' && field.value
                ? field.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                : []
            return (
              <TagInput
                id={fieldId}
                value={items}
                onChange={(arr) => field.onChange(arr.join(', '))}
                ariaLabel={label}
                placeholder={placeholder}
                helperText={helperText}
              />
            )
          }}
        />
      </FormGroup>
    </StackItem>
  )
}
