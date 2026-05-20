import type { UseFormSetError } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'

import type { CredentialType } from '../credentialConstants'

import type { CredentialFormData } from './credentialFormSchema'
import {
  getDefaultInputs,
  getTypeInputs,
  validateCreateModeRequiredDynamicField,
  validateEditModeRequiredDynamicField,
} from './credentialFormUtils'
import type { FieldDefinition } from './DynamicFieldRenderer'

function makeCredentialType(overrides: Partial<CredentialType> & { inputs: unknown }): CredentialType {
  return { id: 'type-1', name: 'Test Type', ...overrides } as CredentialType
}

function makeSetError() {
  return vi.fn<UseFormSetError<CredentialFormData>>()
}

describe('getTypeInputs', () => {
  it('returns fields and required arrays from inputs', () => {
    const fields: FieldDefinition[] = [
      { id: 'token', label: 'Token', type: 'string' },
      { id: 'host', label: 'Host', type: 'string' },
    ]
    const credType = makeCredentialType({ inputs: { fields, required: ['token'] } })

    const result = getTypeInputs(credType)

    expect(result.fields).toEqual(fields)
    expect(result.required).toEqual(['token'])
  })

  it('returns empty arrays when inputs has no fields or required', () => {
    const credType = makeCredentialType({ inputs: {} })

    const result = getTypeInputs(credType)

    expect(result.fields).toEqual([])
    expect(result.required).toEqual([])
  })

  it('returns empty arrays when inputs is null-like', () => {
    const credType = makeCredentialType({ inputs: null as unknown as Record<string, unknown> })

    const result = getTypeInputs(credType)

    expect(result.fields).toEqual([])
    expect(result.required).toEqual([])
  })
})

describe('getDefaultInputs', () => {
  it('returns empty object for undefined type', () => {
    expect(getDefaultInputs(undefined)).toEqual({})
  })

  it('returns defaults from field definitions', () => {
    const credType = makeCredentialType({
      inputs: {
        fields: [
          { id: 'provider', label: 'Provider', type: 'string', default: 'openai' },
          { id: 'token', label: 'Token', type: 'string' },
          { id: 'verify', label: 'Verify', type: 'boolean', default: true },
        ],
        required: [],
      },
    })

    const result = getDefaultInputs(credType)

    expect(result).toEqual({ provider: 'openai', verify: true })
  })

  it('returns empty object when no fields have defaults', () => {
    const credType = makeCredentialType({
      inputs: {
        fields: [{ id: 'token', label: 'Token', type: 'string' }],
        required: [],
      },
    })

    expect(getDefaultInputs(credType)).toEqual({})
  })
})

describe('validateCreateModeRequiredDynamicField', () => {
  it('returns true for non-empty value', () => {
    const setError = makeSetError()
    const field: FieldDefinition = { id: 'token', label: 'Token', type: 'string' }

    const result = validateCreateModeRequiredDynamicField('token', 'my-token', field, setError)

    expect(result).toBe(true)
    expect(setError).not.toHaveBeenCalled()
  })

  it('returns false and sets error for null value', () => {
    const setError = makeSetError()
    const field: FieldDefinition = { id: 'token', label: 'Token', type: 'string' }

    const result = validateCreateModeRequiredDynamicField('token', null, field, setError)

    expect(result).toBe(false)
    expect(setError).toHaveBeenCalledWith('inputs.token', { message: 'Token is required' })
  })

  it('returns false and sets error for empty string', () => {
    const setError = makeSetError()
    const field: FieldDefinition = { id: 'token', label: 'Token', type: 'string' }

    const result = validateCreateModeRequiredDynamicField('token', '', field, setError)

    expect(result).toBe(false)
    expect(setError).toHaveBeenCalledWith('inputs.token', { message: 'Token is required' })
  })

  it('uses field id as fallback when field is undefined', () => {
    const setError = makeSetError()

    const result = validateCreateModeRequiredDynamicField('api_key', null, undefined, setError)

    expect(result).toBe(false)
    expect(setError).toHaveBeenCalledWith('inputs.api_key', { message: 'api_key is required' })
  })
})

describe('validateEditModeRequiredDynamicField', () => {
  it('returns true for non-empty non-secret value', () => {
    const setError = makeSetError()
    const field: FieldDefinition = { id: 'host', label: 'Host', type: 'string' }

    const result = validateEditModeRequiredDynamicField('host', 'example.com', field, new Set(), setError)

    expect(result).toBe(true)
    expect(setError).not.toHaveBeenCalled()
  })

  it('returns false for empty non-secret value', () => {
    const setError = makeSetError()
    const field: FieldDefinition = { id: 'host', label: 'Host', type: 'string' }

    const result = validateEditModeRequiredDynamicField('host', '', field, new Set(), setError)

    expect(result).toBe(false)
    expect(setError).toHaveBeenCalledWith('inputs.host', { message: 'Host is required' })
  })

  it('returns true for untouched secret field regardless of value', () => {
    const setError = makeSetError()
    const field: FieldDefinition = { id: 'token', label: 'Token', type: 'string', secret: true }

    const result = validateEditModeRequiredDynamicField('token', '', field, new Set(), setError)

    expect(result).toBe(true)
    expect(setError).not.toHaveBeenCalled()
  })

  it('returns false for touched secret field with empty value', () => {
    const setError = makeSetError()
    const field: FieldDefinition = { id: 'token', label: 'Token', type: 'string', secret: true }
    const touchedSecrets = new Set(['token'])

    const result = validateEditModeRequiredDynamicField('token', '', field, touchedSecrets, setError)

    expect(result).toBe(false)
    expect(setError).toHaveBeenCalledWith('inputs.token', { message: 'Token is required' })
  })

  it('returns true for touched secret field with non-empty value', () => {
    const setError = makeSetError()
    const field: FieldDefinition = { id: 'token', label: 'Token', type: 'string', secret: true }
    const touchedSecrets = new Set(['token'])

    const result = validateEditModeRequiredDynamicField('token', 'new-value', field, touchedSecrets, setError)

    expect(result).toBe(true)
    expect(setError).not.toHaveBeenCalled()
  })

  it('returns false for null non-secret value', () => {
    const setError = makeSetError()
    const field: FieldDefinition = { id: 'host', label: 'Host', type: 'string' }

    const result = validateEditModeRequiredDynamicField('host', null, field, new Set(), setError)

    expect(result).toBe(false)
    expect(setError).toHaveBeenCalledWith('inputs.host', { message: 'Host is required' })
  })
})
