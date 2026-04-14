import { zodResolver } from '@hookform/resolvers/zod'
import {
  Button,
  Content,
  ContentVariants,
  Form,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  TextInput,
} from '@patternfly/react-core'
import { RhUiErrorIcon } from '@patternfly/react-icons'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'

import { credentialsClient } from '../../../../client'
import { useAlerts } from '../../../../components/alerts'
import { FormLabelWithHelp } from '../../../../components/FormLabelWithHelp'
import { useFormMutationErrorHandler } from '../../../../hooks/useFormMutationErrorHandler'
import type { Credential, CredentialType } from '../credentialConstants'
import { ENCRYPTED_SENTINEL } from '../credentialConstants'

import { credentialFormSchema, type CredentialFormData } from './credentialFormSchema'
import type { FieldDefinition } from './DynamicFieldRenderer'
import { DynamicFieldRenderer } from './DynamicFieldRenderer'

interface CredentialFormModalProps {
  isOpen: boolean
  onClose: () => void
  credentialToEdit?: Credential | null
  onSuccess?: () => void
  /** When provided, pre-selects the credential type and disables the type dropdown */
  preSelectedTypeId?: string
  /** Called with the new credential's ID on successful creation */
  onCreated?: (credentialId: string) => void
}

interface TypeInputs {
  fields: FieldDefinition[]
  required: string[]
}

function getTypeInputs(credType: CredentialType): TypeInputs {
  const inputs = credType.inputs as Record<string, unknown>
  return {
    fields: (inputs?.fields as FieldDefinition[]) ?? [],
    required: (inputs?.required as string[]) ?? [],
  }
}

function getDefaultInputs(credType: CredentialType | undefined): Record<string, unknown> {
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

// eslint-disable-next-line max-lines-per-function
export function CredentialFormModal({
  isOpen,
  onClose,
  credentialToEdit,
  onSuccess,
  preSelectedTypeId,
  onCreated,
}: Readonly<CredentialFormModalProps>) {
  const isEditMode = !!credentialToEdit
  const { showAlert } = useAlerts()

  // Track which secret fields have been touched by the user (for edit mode)
  const [touchedSecrets, setTouchedSecrets] = useState<Set<string>>(new Set())

  // Zod + react-hook-form
  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CredentialFormData>({
    resolver: zodResolver(credentialFormSchema, undefined, { mode: 'sync' }),
    defaultValues: {
      name: '',
      description: '',
      credential_type_id: '',
      inputs: {},
    },
  })
  const handleMutationError = useFormMutationErrorHandler<CredentialFormData>(setError)

  // Watched values for derived state
  const selectedTypeId = watch('credential_type_id')
  const inputs = watch('inputs')

  // Fetch credential types
  const typesQuery = credentialsClient.useQuery('get', '/credential-types')
  const types = useMemo(() => typesQuery.data?.resources ?? [], [typesQuery.data])

  // Selected type
  const selectedType = useMemo(() => types.find((t) => t.id === selectedTypeId), [types, selectedTypeId])
  const typeInputs = useMemo(() => (selectedType ? getTypeInputs(selectedType) : null), [selectedType])

  // Mutations
  const { mutate: createCredential } = credentialsClient.useMutation('post', '/credentials')
  const { mutate: patchCredential } = credentialsClient.useMutation('patch', '/credentials/{credential_id}')

  // Reset form when modal opens/closes or credential changes
  const resetKey = isOpen ? (credentialToEdit?.id ?? preSelectedTypeId ?? 'create') : 'closed'
  useEffect(() => {
    if (!isOpen) return

    setTouchedSecrets(new Set())
    if (credentialToEdit) {
      reset({
        name: credentialToEdit.name,
        description: credentialToEdit.description ?? '',
        credential_type_id: credentialToEdit.credential_type_id,
        inputs: credentialToEdit.inputs as Record<string, unknown>,
      })
    } else {
      reset({
        name: '',
        description: '',
        credential_type_id: preSelectedTypeId ?? '',
        inputs: {},
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on modal open/close, keyed by resetKey
  }, [resetKey])

  // Auto-select first type in create mode when types load
  useEffect(() => {
    if (!isEditMode && !selectedTypeId && !preSelectedTypeId && types.length > 0) {
      const defaultType = types[0]
      setValue('credential_type_id', defaultType.id)
      setValue('inputs', getDefaultInputs(defaultType))
    }
  }, [types, isEditMode, selectedTypeId, preSelectedTypeId, setValue])

  // Reset inputs when type changes (create mode only)
  const handleTypeChange = useCallback(
    (_event: React.FormEvent, typeId: string) => {
      setValue('credential_type_id', typeId, { shouldValidate: true })
      if (!isEditMode) {
        const newType = types.find((t) => t.id === typeId)
        setValue('inputs', newType ? getDefaultInputs(newType) : {})
      }
    },
    [isEditMode, types, setValue]
  )

  const handleInputChange = useCallback(
    (fieldId: string, value: unknown) => {
      setValue(`inputs.${fieldId}`, value, { shouldValidate: true })
    },
    [setValue]
  )

  // Track secret field touches separately (DynamicFieldRenderer calls onChange,
  // but we need to know if a secret was explicitly modified by the user)
  const handleSecretInputChange = useCallback(
    (fieldId: string, value: unknown) => {
      setTouchedSecrets((prev) => new Set(prev).add(fieldId))
      handleInputChange(fieldId, value)
    },
    [handleInputChange]
  )

  // Validate dynamic required fields (Zod handles static fields)
  function validateDynamicFields(): boolean {
    if (!typeInputs) return true
    let valid = true

    for (const requiredId of typeInputs.required) {
      const val: unknown = inputs[requiredId]
      const field = typeInputs.fields.find((f) => f.id === requiredId)

      if (isEditMode) {
        // In edit mode, only validate if the field is a secret that was touched,
        // or a non-secret field that was cleared
        const isSecret = field?.secret === true
        if (isSecret) {
          // Secret field: validate only if user touched it and left it empty
          if (touchedSecrets.has(requiredId) && (val == null || val === '')) {
            setError(`inputs.${requiredId}`, { message: `${field?.label ?? requiredId} is required` })
            valid = false
          }
        } else if (val == null || val === '') {
          // Non-secret required field cleared in edit mode
          setError(`inputs.${requiredId}`, { message: `${field?.label ?? requiredId} is required` })
          valid = false
        }
      } else {
        // Create mode: all required fields must be filled
        if (val == null || val === '') {
          setError(`inputs.${requiredId}`, { message: `${field?.label ?? requiredId} is required` })
          valid = false
        }
      }
    }

    return valid
  }

  function buildEditInputs(currentInputs: Record<string, unknown>): Record<string, unknown> {
    if (!typeInputs) return currentInputs
    const result = { ...currentInputs }
    for (const field of typeInputs.fields) {
      if (field.secret) {
        const val = result[field.id]
        // Only preserve existing encrypted value if the user didn't touch this field
        if (!touchedSecrets.has(field.id) || val === '' || val == null || val === ENCRYPTED_SENTINEL) {
          result[field.id] = ENCRYPTED_SENTINEL
        }
      }
    }
    return result
  }

  function onSubmit(formData: CredentialFormData) {
    if (!validateDynamicFields()) return

    if (isEditMode && credentialToEdit) {
      patchCredential(
        {
          params: { path: { credential_id: credentialToEdit.id } },
          body: {
            name: formData.name,
            description: formData.description || null,
            inputs: buildEditInputs(formData.inputs),
          },
        },
        {
          onSuccess: () => {
            showAlert({ title: 'Credential updated', variant: 'success', autoDismiss: true })
            onSuccess?.()
            onClose()
          },
          onError: handleMutationError({ title: 'Failed to update credential' }),
        }
      )
    } else {
      createCredential(
        {
          body: {
            name: formData.name,
            description: formData.description || null,
            credential_type_id: formData.credential_type_id,
            inputs: formData.inputs,
          },
        },
        {
          onSuccess: (response) => {
            showAlert({ title: 'Credential created', variant: 'success', autoDismiss: true })
            if (response?.id) {
              onCreated?.(response.id)
            }
            onSuccess?.()
            onClose()
          },
          onError: handleMutationError({ title: 'Failed to create credential' }),
        }
      )
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} variant="medium">
      <ModalHeader title={isEditMode ? 'Edit credential' : 'Create credential'} />
      <ModalBody>
        <Form>
          {/* Name */}
          <FormGroup
            label={
              <FormLabelWithHelp
                label="Name"
                helpText="A unique, descriptive name for this credential. Use a name that helps identify its purpose, such as 'Production API Key' or 'Dev SSH Key'."
              />
            }
            fieldId="credential-name"
            isRequired
          >
            <Controller
              name="name"
              control={control}
              render={({ field: { onChange, value }, fieldState: { error } }) => (
                <>
                  <TextInput
                    id="credential-name"
                    value={value}
                    onChange={(_event, val) => onChange(val)}
                    validated={error ? 'error' : 'default'}
                    placeholder="Enter credential name"
                    aria-label="Credential name"
                  />
                  {error?.message && (
                    <FormHelperText>
                      <HelperText>
                        <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                          {error.message}
                        </HelperTextItem>
                      </HelperText>
                    </FormHelperText>
                  )}
                </>
              )}
            />
          </FormGroup>

          {/* Description */}
          <FormGroup
            label={
              <FormLabelWithHelp
                label="Description"
                helpText="An optional description to provide additional context about this credential, such as what systems it accesses or any usage restrictions."
              />
            }
            fieldId="credential-description"
          >
            <Controller
              name="description"
              control={control}
              render={({ field: { onChange, value } }) => (
                <TextInput
                  id="credential-description"
                  value={value ?? ''}
                  onChange={(_event, val) => onChange(val)}
                  placeholder="Enter description (optional)"
                  aria-label="Credential description"
                />
              )}
            />
          </FormGroup>

          {/* Credential Type */}
          <FormGroup
            label={
              <FormLabelWithHelp
                label="Credential type"
                helpText={
                  <Content>
                    <Content component={ContentVariants.p} style={{ margin: 0 }}>
                      Select the type of credential based on the authentication method required:
                    </Content>
                    <Content component="ul">
                      <Content component="li">
                        <strong>HTTP Bearer Token</strong> &ndash; For APIs using bearer token authentication
                      </Content>
                      <Content component="li">
                        <strong>HTTP Basic Auth</strong> &ndash; For APIs using username/password authentication
                      </Content>
                      <Content component="li">
                        <strong>SSH Key</strong> &ndash; For SSH connections to remote servers
                      </Content>
                      <Content component="li">
                        <strong>LLM Provider</strong> &ndash; For AI/LLM service API keys
                      </Content>
                      <Content component="li">
                        <strong>Ansible Automation Platform</strong> &ndash; For AAP API access
                      </Content>
                    </Content>
                  </Content>
                }
              />
            }
            fieldId="credential-type"
            isRequired
          >
            <FormSelect
              id="credential-type"
              value={selectedTypeId}
              onChange={handleTypeChange}
              isDisabled={isEditMode || !!preSelectedTypeId || typesQuery.isLoading}
              validated={errors.credential_type_id ? 'error' : 'default'}
              aria-label="Credential type"
            >
              {typesQuery.isLoading && <FormSelectOption value="" label="Loading types..." isPlaceholder />}
              {types.map((t) => (
                <FormSelectOption key={t.id} value={t.id} label={t.name} />
              ))}
            </FormSelect>
            {typesQuery.error && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                    Failed to load credential types
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
            {selectedType?.description && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>{selectedType.description}</HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
            {errors.credential_type_id?.message && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                    {errors.credential_type_id.message}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>

          {/* Dynamic Fields */}
          {typeInputs?.fields.map((field) => {
            const isSecret = field.secret === true
            return (
              <DynamicFieldRenderer
                key={field.id}
                field={field}
                value={(inputs[field.id] as string | boolean | undefined) ?? ''}
                onChange={isSecret ? handleSecretInputChange : handleInputChange}
                isRequired={typeInputs.required.includes(field.id)}
                isEditMode={isEditMode}
                error={(errors.inputs as Record<string, { message?: string }> | undefined)?.[field.id]?.message}
              />
            )
          })}
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" onClick={handleSubmit(onSubmit)} isDisabled={isSubmitting} isLoading={isSubmitting}>
          {isEditMode ? 'Save changes' : 'Create credential'}
        </Button>
        <Button variant="link" onClick={onClose} isDisabled={isSubmitting}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}
