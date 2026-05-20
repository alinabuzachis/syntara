import type { UseFormSetError } from 'react-hook-form'

import type { CredentialType } from '../credentialConstants'

import type { CredentialFormData } from './credentialFormSchema'
import type { FieldDefinition } from './DynamicFieldRenderer'

export type TypeInputs = {
  fields: FieldDefinition[]
  required: string[]
}

/** Extract the dynamic field definitions and required field IDs from a credential type's inputs schema. */
export function getTypeInputs(credType: CredentialType): TypeInputs {
  const inputs = credType.inputs as Record<string, unknown>
  return {
    fields: (inputs?.fields as FieldDefinition[]) ?? [],
    required: (inputs?.required as string[]) ?? [],
  }
}

/** Build default input values for a credential type, using each field's `default` when defined. */
export function getDefaultInputs(credType: CredentialType | undefined): Record<string, unknown> {
  if (!credType) return {}
  const typeInputs = getTypeInputs(credType)
  const defaults: Record<string, unknown> = {}
  for (const field of typeInputs.fields) {
    if (field.default != null) {
      defaults[field.id] = field.default
    }
  }
  return defaults
}

/** Validate a required dynamic field in edit mode — skips untouched secret fields to preserve existing encrypted values. */
export function validateEditModeRequiredDynamicField(
  requiredId: string,
  val: unknown,
  field: FieldDefinition | undefined,
  touchedSecrets: Set<string>,
  setError: UseFormSetError<CredentialFormData>
): boolean {
  const isSecret = field?.secret === true
  if (isSecret) {
    if (touchedSecrets.has(requiredId) && (val == null || val === '')) {
      setError(`inputs.${requiredId}`, { message: `${field?.label ?? requiredId} is required` })
      return false
    }
    return true
  }
  if (val == null || val === '') {
    setError(`inputs.${requiredId}`, { message: `${field?.label ?? requiredId} is required` })
    return false
  }
  return true
}

/** Validate a required dynamic field in create mode — all required fields must have a non-empty value. */
export function validateCreateModeRequiredDynamicField(
  requiredId: string,
  val: unknown,
  field: FieldDefinition | undefined,
  setError: UseFormSetError<CredentialFormData>
): boolean {
  if (val == null || val === '') {
    setError(`inputs.${requiredId}`, { message: `${field?.label ?? requiredId} is required` })
    return false
  }
  return true
}
