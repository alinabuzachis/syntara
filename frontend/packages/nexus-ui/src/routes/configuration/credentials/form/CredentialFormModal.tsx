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
  MenuToggle,
  type MenuToggleElement,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Select,
  SelectList,
  SelectOption,
  Spinner,
  TextInput,
} from '@patternfly/react-core'
import { RhUiAddIcon, RhUiEditIcon, RhUiErrorIcon } from '@patternfly/react-icons'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Ref } from 'react'
import { Controller, useForm } from 'react-hook-form'

import { credentialsClient } from '../../../../client'
import { FormLabelWithHelp } from '../../../../components/FormLabelWithHelp'
import { useFormMutationErrorHandler } from '../../../../hooks/useFormMutationErrorHandler'
import { useAlerts } from '../../../../providers/alerts'
import { useAllProjects } from '../../../access/useAllProjects'
import type { Credential } from '../credentialConstants'
import { ENCRYPTED_SENTINEL } from '../credentialConstants'

import { credentialFormSchema, type CredentialFormData } from './credentialFormSchema'
import {
  getDefaultInputs,
  getTypeInputs,
  validateCreateModeRequiredDynamicField,
  validateEditModeRequiredDynamicField,
} from './credentialFormUtils'
import { DynamicFieldRenderer } from './DynamicFieldRenderer'

type CredentialFormModalProps = {
  isOpen: boolean
  onClose: () => void
  credentialToEdit?: Credential | null
  onSuccess?: () => void
  /** When provided, pre-selects the credential type and disables the type dropdown */
  preSelectedTypeId?: string
  /** Called with the new credential's ID on successful creation */
  onCreated?: (credentialId: string) => void
  /** When provided, pre-selects the project in the Project dropdown */
  defaultProjectId?: string
}

const INLINE_POPPER_PROPS = { appendTo: 'inline' } as const

// eslint-disable-next-line max-lines-per-function
export function CredentialFormModal({
  isOpen,
  onClose,
  credentialToEdit,
  onSuccess,
  preSelectedTypeId,
  onCreated,
  defaultProjectId,
}: Readonly<CredentialFormModalProps>) {
  const isEditMode = !!credentialToEdit
  const { showAlert } = useAlerts()
  const { projects, isLoading: isLoadingProjects, error: projectsError } = useAllProjects()

  // Track which secret fields have been touched by the user (for edit mode)
  const [touchedSecrets, setTouchedSecrets] = useState<Set<string>>(new Set())

  // PF6 Select open state for credential type dropdown
  const [isTypeSelectOpen, setIsTypeSelectOpen] = useState(false)

  // Zod + react-hook-form
  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm<CredentialFormData>({
    resolver: zodResolver(credentialFormSchema, undefined, { mode: 'sync' }),
    defaultValues: {
      name: '',
      description: '',
      project_id: '',
      credential_type_id: '',
      inputs: {},
    },
  })
  const handleMutationError = useFormMutationErrorHandler<CredentialFormData>(setError)

  // Watched values for derived state
  const selectedTypeId = watch('credential_type_id')
  const inputs = watch('inputs')

  // Fetch credential types
  const typesQuery = credentialsClient.useQuery('get', '/credential_types')
  const types = useMemo(() => typesQuery.data?.resources ?? [], [typesQuery.data])

  // Selected type
  const selectedType = useMemo(() => types.find((t) => t.id === selectedTypeId), [types, selectedTypeId])
  const typeInputs = useMemo(() => (selectedType ? getTypeInputs(selectedType) : null), [selectedType])

  // Mutations
  const { mutate: createCredential, isPending: isCreating } = credentialsClient.useMutation('post', '/credentials')
  const { mutate: patchCredential, isPending: isPatching } = credentialsClient.useMutation(
    'patch',
    '/credentials/{credential_id}'
  )
  const isSubmitting = isCreating || isPatching

  // Reset form when modal opens/closes or credential changes
  const resetKey = isOpen ? (credentialToEdit?.id ?? preSelectedTypeId ?? 'create') : 'closed'
  useEffect(() => {
    if (!isOpen) return

    setTouchedSecrets(new Set())
    if (credentialToEdit) {
      reset({
        name: credentialToEdit.name,
        description: credentialToEdit.description ?? '',
        project_id: credentialToEdit.project_id ?? '',
        credential_type_id: credentialToEdit.credential_type_id,
        inputs: credentialToEdit.inputs as Record<string, unknown>,
      })
    } else {
      reset({
        name: '',
        description: '',
        project_id: defaultProjectId ?? '',
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
      setValue('credential_type_id', defaultType.id!)
      setValue('inputs', getDefaultInputs(defaultType))
    }
  }, [types, isEditMode, selectedTypeId, preSelectedTypeId, setValue])

  // Reset inputs when type changes (create mode only)
  const handleTypeSelect = useCallback(
    (_event: React.MouseEvent | undefined, typeId: string | number | undefined) => {
      if (typeId == null) return
      const id = String(typeId)
      setIsTypeSelectOpen(false)
      setValue('credential_type_id', id, { shouldValidate: true })
      if (!isEditMode) {
        const newType = types.find((t) => t.id === id)
        setValue('inputs', newType ? getDefaultInputs(newType) : {})
      }
    },
    [isEditMode, types, setValue]
  )

  const isTypeSelectDisabled = isEditMode || !!preSelectedTypeId || typesQuery.isLoading

  const typeToggleLabel = useMemo(() => {
    if (typesQuery.isLoading) return 'Loading types...'
    return selectedType?.name ?? 'Select a credential type'
  }, [typesQuery.isLoading, selectedType?.name])

  const renderTypeToggle = useCallback(
    (toggleRef: Ref<MenuToggleElement>) => (
      <MenuToggle
        ref={toggleRef}
        onClick={() => setIsTypeSelectOpen((prev) => !prev)}
        isExpanded={isTypeSelectOpen}
        isDisabled={isTypeSelectDisabled}
        isFullWidth
        status={errors.credential_type_id ? 'danger' : undefined}
        aria-label="Credential type"
      >
        {typesQuery.isLoading ? (
          <>
            <Spinner size="sm" aria-label="Loading credential types" /> {typeToggleLabel}
          </>
        ) : (
          typeToggleLabel
        )}
      </MenuToggle>
    ),
    [isTypeSelectOpen, isTypeSelectDisabled, errors.credential_type_id, typesQuery.isLoading, typeToggleLabel]
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
        if (!validateEditModeRequiredDynamicField(requiredId, val, field, touchedSecrets, setError)) {
          valid = false
        }
      } else if (!validateCreateModeRequiredDynamicField(requiredId, val, field, setError)) {
        valid = false
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
          params: { path: { credential_id: credentialToEdit.id! } },
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
            project_id: formData.project_id,
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

          {/* Project */}
          <FormGroup
            label={
              <FormLabelWithHelp
                label="Project"
                helpText="The project this credential belongs to. Credentials are scoped to a single project and can only be used by workflows within that project."
              />
            }
            fieldId="credential-project"
            isRequired={!isEditMode}
          >
            <Controller
              name="project_id"
              control={control}
              render={({ field: { onChange, value }, fieldState: { error } }) => (
                <>
                  <FormSelect
                    id="credential-project"
                    value={value}
                    onChange={(_event, val) => onChange(val)}
                    isDisabled={isEditMode || isLoadingProjects}
                    validated={error ? 'error' : 'default'}
                    aria-label="Credential project"
                    aria-required={!isEditMode}
                  >
                    {isLoadingProjects && <FormSelectOption value="" label="Loading projects..." isPlaceholder />}
                    {!isLoadingProjects && !isEditMode && (
                      <FormSelectOption value="" label="Select a project" isPlaceholder />
                    )}
                    {projects.map((p) => (
                      <FormSelectOption key={p.id} value={p.id} label={p.name} />
                    ))}
                  </FormSelect>
                  {projectsError && (
                    <FormHelperText>
                      <HelperText>
                        <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                          Failed to load projects
                        </HelperTextItem>
                      </HelperText>
                    </FormHelperText>
                  )}
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
            <Select
              id="credential-type"
              isOpen={isTypeSelectOpen}
              selected={selectedTypeId}
              onSelect={handleTypeSelect}
              onOpenChange={setIsTypeSelectOpen}
              toggle={renderTypeToggle}
              shouldFocusToggleOnSelect
              popperProps={INLINE_POPPER_PROPS}
            >
              <SelectList aria-label="Credential type options">
                {types.map((t) => (
                  <SelectOption key={t.id} value={t.id} isSelected={t.id === selectedTypeId}>
                    {t.name}
                  </SelectOption>
                ))}
              </SelectList>
            </Select>
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
        <Button
          variant="primary"
          onClick={handleSubmit(onSubmit)}
          isDisabled={isSubmitting}
          isLoading={isSubmitting}
          icon={isEditMode ? <RhUiEditIcon /> : <RhUiAddIcon />}
        >
          {isEditMode ? 'Save changes' : 'Create credential'}
        </Button>
        <Button variant="link" onClick={onClose} isDisabled={isSubmitting}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}
