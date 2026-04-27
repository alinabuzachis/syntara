import type { CredentialsAPI } from '@ansible/nexus-contracts'
import {
  Button,
  Divider,
  FormGroup,
  MenuToggle,
  type MenuToggleElement,
  Select,
  SelectGroup,
  SelectList,
  SelectOption,
  Spinner,
} from '@patternfly/react-core'
import { PlusIcon } from '@patternfly/react-icons'
import React, { useCallback, useMemo, useState } from 'react'

import { credentialsClient } from '../client'
import type { Credential, CredentialType } from '../routes/configuration/credentials/credentialConstants'
import { CredentialFormModal } from '../routes/configuration/credentials/form/CredentialFormModal'
import { detachPromise } from '../utils/detachPromise'

import { FormLabelWithHelp } from './FormLabelWithHelp'

export interface CredentialSelectorProps {
  /** Currently selected credential ID */
  value?: string
  /** Callback when selection changes */
  onChange: (credentialId: string | undefined) => void
  /** Credential type names to filter by (only show compatible credentials) */
  compatibleTypeNames?: string[]
  /** Label for the form group */
  label?: string
  /** Field ID for form group */
  fieldId?: string
  /** Whether the field is disabled */
  isDisabled?: boolean
  /** Whether to show "Create new credential" option */
  allowCreate?: boolean
  /** Credential type ID to pre-select when creating (locks the type dropdown) */
  preSelectedTypeId?: string
  /** Placeholder text shown when no credential is selected */
  placeholder?: string
  /** Help text shown in a popover next to the label */
  helpText?: React.ReactNode
  /** Filter credentials to this project */
  projectId?: string
}

const NO_CREDENTIAL_VALUE = '__none__'
const CREATE_NEW_VALUE = '__create_new__'

function credentialDescription(credential: { enabled: boolean; description?: string | null }) {
  if (credential.enabled) return credential.description ?? undefined
  return `${credential.description ?? ''} (disabled)`.trim()
}

function buildTypeGroups(credentials: Credential[], credentialTypes: CredentialType[]): TypeGroup[] {
  if (credentialTypes.length === 0) {
    return credentials.length > 0 ? [{ typeId: '__ungrouped__', typeName: '', credentials }] : []
  }
  const typeMap = new Map<string, CredentialType>()
  for (const ct of credentialTypes) {
    typeMap.set(ct.id!, ct)
  }
  const groupMap = new Map<string, TypeGroup>()
  for (const cred of credentials) {
    const typeId = cred.credential_type_id
    if (!groupMap.has(typeId)) {
      const ct = typeMap.get(typeId)
      groupMap.set(typeId, { typeId, typeName: ct?.name ?? 'Unknown', credentials: [] })
    }
    groupMap.get(typeId)!.credentials.push(cred)
  }
  return Array.from(groupMap.values())
}

interface TypeGroup {
  typeId: string
  typeName: string
  credentials: Credential[]
}

/**
 * A PatternFly Select dropdown for choosing a credential.
 * Fetches credentials from the API with optional type filtering.
 * Credentials are grouped by credential type when type data is available.
 */

export function CredentialSelector({
  value,
  onChange,
  compatibleTypeNames,
  label = 'Credential',
  fieldId = 'credential-selector',
  isDisabled = false,
  allowCreate = false,
  preSelectedTypeId,
  placeholder = 'Select a credential...',
  helpText,
  projectId,
}: Readonly<CredentialSelectorProps>) {
  const [isOpen, setIsOpen] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

  // TODO: Remove type extension when project_id is added to the OpenAPI spec
  type CredentialQueryParams = CredentialsAPI.operations['list_credentials']['parameters']['query'] & {
    project_id?: string
  }
  const credentialQueryParams: CredentialQueryParams = useMemo(
    () => (projectId ? { project_id: projectId } : {}),
    [projectId]
  )
  const { data, isPending, isError, refetch } = credentialsClient.useQuery('get', '/credentials', {
    params: { query: credentialQueryParams },
  })

  const { data: typesData } = credentialsClient.useQuery('get', '/credential_types')

  const allCredentials: Credential[] = useMemo(() => data?.resources ?? [], [data?.resources])
  const credentialTypes: CredentialType[] = useMemo(() => typesData?.resources ?? [], [typesData?.resources])

  // Derive compatible type IDs from type names
  const compatibleTypeIds = useMemo(() => {
    if (!compatibleTypeNames || credentialTypes.length === 0) return null
    return credentialTypes.filter((t) => compatibleTypeNames.includes(t.name)).map((t) => t.id)
  }, [compatibleTypeNames, credentialTypes])

  // Auto-resolve preSelectedTypeId from compatible types (first match)
  const resolvedPreSelectedTypeId = useMemo(() => {
    if (preSelectedTypeId) return preSelectedTypeId
    if (compatibleTypeIds && compatibleTypeIds.length > 0) return compatibleTypeIds[0]
    return undefined
  }, [preSelectedTypeId, compatibleTypeIds])

  // Filter credentials by compatible types (client-side)
  const credentials: Credential[] = useMemo(() => {
    if (!compatibleTypeIds) return allCredentials
    return allCredentials.filter((c) => compatibleTypeIds.includes(c.credential_type_id))
  }, [allCredentials, compatibleTypeIds])

  const typeGroups: TypeGroup[] = useMemo(
    () => buildTypeGroups(credentials, credentialTypes),
    [credentials, credentialTypes]
  )

  const selectedCredential = useMemo(() => credentials.find((c) => c.id === value), [credentials, value])

  const toggleLabel = useMemo(() => {
    if (isPending) return 'Loading credentials...'
    if (isError) return 'Error loading credentials'
    return selectedCredential?.name ?? placeholder
  }, [isPending, isError, selectedCredential?.name, placeholder])

  const handleSelect = useCallback(
    (_event: React.MouseEvent | undefined, selectedValue: string | number | undefined) => {
      setIsOpen(false)
      if (selectedValue === CREATE_NEW_VALUE) {
        setIsCreateModalOpen(true)
      } else {
        onChange(selectedValue === NO_CREDENTIAL_VALUE ? undefined : String(selectedValue))
      }
    },
    [onChange]
  )

  const handleCreated = useCallback(
    (newCredentialId: string) => {
      detachPromise(refetch())
      onChange(newCredentialId)
    },
    [onChange, refetch]
  )

  const formGroupLabel = helpText ? <FormLabelWithHelp label={label} helpText={helpText} /> : label

  const hasGroups = credentialTypes.length > 0

  const renderCredentialOption = (credential: (typeof credentials)[number]) => (
    <SelectOption
      key={credential.id}
      value={credential.id}
      isSelected={credential.id === value}
      isDisabled={!credential.enabled}
      description={credentialDescription(credential as { enabled: boolean; description?: string | null })}
    >
      {credential.name}
    </SelectOption>
  )

  const renderToggle = useCallback(
    (toggleRef: React.Ref<MenuToggleElement>) => (
      <MenuToggle
        ref={toggleRef}
        onClick={() => setIsOpen((prev) => !prev)}
        isExpanded={isOpen}
        isDisabled={isDisabled || isPending}
        isFullWidth
        status={isError ? 'danger' : undefined}
        aria-label={label}
      >
        {isPending ? (
          <>
            <Spinner size="sm" aria-label="Loading credentials" /> {toggleLabel}
          </>
        ) : (
          toggleLabel
        )}
      </MenuToggle>
    ),
    [isOpen, isDisabled, isPending, isError, label, toggleLabel]
  )

  return (
    <FormGroup label={formGroupLabel} fieldId={fieldId}>
      <Select
        id={fieldId}
        isOpen={isOpen}
        selected={value ?? NO_CREDENTIAL_VALUE}
        onSelect={handleSelect}
        onOpenChange={setIsOpen}
        toggle={renderToggle}
      >
        <SelectList aria-label={`${label} options`}>
          {allowCreate && (
            <>
              <SelectOption value={CREATE_NEW_VALUE} icon={<PlusIcon />}>
                Create new credential
              </SelectOption>
              <Divider />
            </>
          )}
          {hasGroups
            ? typeGroups.map((group) => (
                <SelectGroup key={group.typeId} label={group.typeName.toUpperCase()}>
                  {group.credentials.map(renderCredentialOption)}
                </SelectGroup>
              ))
            : credentials.map(renderCredentialOption)}
          {credentials.length === 0 && !isPending && !allowCreate && (
            <SelectOption isDisabled value="__empty__">
              {isError ? 'Failed to load credentials' : 'No credentials available'}
            </SelectOption>
          )}
        </SelectList>
      </Select>
      {isError && (
        <Button variant="link" size="sm" onClick={() => detachPromise(refetch())}>
          Retry loading credentials
        </Button>
      )}
      {allowCreate && (
        <CredentialFormModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          preSelectedTypeId={resolvedPreSelectedTypeId}
          onCreated={handleCreated}
          defaultProjectId={projectId}
        />
      )}
    </FormGroup>
  )
}
