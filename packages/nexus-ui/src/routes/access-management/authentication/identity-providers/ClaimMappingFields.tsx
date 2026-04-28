import {
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  MenuToggle,
  Select,
  SelectList,
  SelectOption,
  TextInput,
  TextInputGroup,
  TextInputGroupMain,
} from '@patternfly/react-core'
import { RhUiErrorIcon } from '@patternfly/react-icons'
import { useMemo, useRef, useState } from 'react'
import { Controller, type Control } from 'react-hook-form'

import { type IdentityProviderFormData } from './identityProviderFormSchema'

const CUSTOM_OPTION = '__custom__'

export type ClaimMappingFieldsProps = {
  control: Control<IdentityProviderFormData>
  claimsSupported?: string[] | null
  claimAliases?: Record<string, string[]> | null
  isReadOnly?: boolean
}

function buildOptions(
  nexusField: string,
  claimsSupported: string[] | null | undefined,
  claimAliases: Record<string, string[]> | null | undefined
): string[] | null {
  if (!claimsSupported) return null

  const aliases = claimAliases?.[nexusField] ?? []
  const aliasSet = new Set(aliases)
  const matched = claimsSupported.filter((c) => aliasSet.has(c))
  const rest = claimsSupported.filter((c) => !aliasSet.has(c))
  return [...matched, ...rest]
}

type ClaimFieldProps = {
  control: Control<IdentityProviderFormData>
  name: `claimMapping.${keyof IdentityProviderFormData['claimMapping']}`
  label: string
  hint: string
  options: string[] | null
  isRequired?: boolean
  isReadOnly?: boolean
}

/**
 * A single claim mapping field that renders either a typeahead dropdown or a plain text input.
 *
 * State rationale:
 * - `useCustom` — tracks whether the user has opted out of the dropdown to type a free-form
 *   claim name. This is local toggle state (not persisted) because the underlying form value
 *   is always a plain string regardless of input mode. Selecting "Custom..." in the dropdown
 *   flips this flag; it resets on remount (e.g. navigating away and back to the step).
 * - `filterValue` — transient typeahead filter text, separate from the form field value.
 *   The dropdown shows `filterValue` while open and the selected claim name when closed,
 *   so the two must be tracked independently.
 */
function ClaimField({ control, name, label, hint, options, isRequired = true, isReadOnly }: Readonly<ClaimFieldProps>) {
  const [useCustom, setUseCustom] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [filterValue, setFilterValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const filteredOptions = useMemo(() => {
    if (!options) return []
    if (!filterValue) return options
    const term = filterValue.toLowerCase()
    return options.filter((opt) => opt.toLowerCase().includes(term))
  }, [options, filterValue])

  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => {
        const showDropdown = options && !useCustom && !isReadOnly
        const currentValue = field.value ?? ''
        const helperMessage = isReadOnly
          ? 'Pre-configured by provider template. Select Custom to modify.'
          : (fieldState.error?.message ?? hint)

        return (
          <FormGroup label={label} fieldId={name} isRequired={isRequired}>
            {showDropdown ? (
              <Select
                id={name}
                isOpen={isOpen}
                selected={currentValue || undefined}
                onSelect={(_event, value) => {
                  const val = String(value)
                  if (val === CUSTOM_OPTION) {
                    setUseCustom(true)
                    setIsOpen(false)
                    setFilterValue('')
                    return
                  }
                  field.onChange(val || null)
                  setIsOpen(false)
                  setFilterValue('')
                }}
                onOpenChange={(open) => {
                  setIsOpen(open)
                  if (!open) setFilterValue('')
                }}
                toggle={(toggleRef) => (
                  <MenuToggle
                    ref={toggleRef}
                    variant="typeahead"
                    onClick={() => setIsOpen((prev) => !prev)}
                    isExpanded={isOpen}
                    isFullWidth
                    status={fieldState.error ? 'danger' : undefined}
                  >
                    <TextInputGroup isPlain>
                      <TextInputGroupMain
                        value={isOpen ? filterValue : currentValue}
                        onChange={(_e, val) => {
                          setFilterValue(val)
                          if (!isOpen) setIsOpen(true)
                        }}
                        onClick={() => {
                          if (!isOpen) setIsOpen(true)
                        }}
                        placeholder={hint}
                        autoComplete="off"
                        innerRef={inputRef}
                      />
                    </TextInputGroup>
                  </MenuToggle>
                )}
              >
                <SelectList style={{ maxHeight: '200px', overflow: 'auto' }}>
                  {!isRequired && (
                    <SelectOption value="" isSelected={!currentValue}>
                      None
                    </SelectOption>
                  )}
                  {filteredOptions.length === 0 && filterValue ? (
                    <SelectOption isDisabled>No claims match &quot;{filterValue}&quot;</SelectOption>
                  ) : (
                    filteredOptions.map((opt) => (
                      <SelectOption key={opt} value={opt} isSelected={currentValue === opt}>
                        {opt}
                      </SelectOption>
                    ))
                  )}
                  <SelectOption value={CUSTOM_OPTION}>Custom...</SelectOption>
                </SelectList>
              </Select>
            ) : (
              <TextInput
                id={name}
                placeholder={hint}
                validated={fieldState.error ? 'error' : 'default'}
                value={currentValue}
                onChange={(_event, value) => field.onChange(value)}
                onBlur={field.onBlur}
                name={field.name}
                isDisabled={isReadOnly}
              />
            )}
            <FormHelperText>
              <HelperText>
                <HelperTextItem
                  variant={fieldState.error ? 'error' : 'default'}
                  icon={fieldState.error ? <RhUiErrorIcon /> : undefined}
                >
                  {helperMessage}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>
        )
      }}
    />
  )
}

export function UserClaimMappingFields({
  control,
  claimsSupported,
  claimAliases,
  isReadOnly,
}: Readonly<ClaimMappingFieldsProps>) {
  return (
    <>
      <ClaimField
        control={control}
        name="claimMapping.subject"
        label="Subject claim"
        hint="IdP claim for the unique user identifier (e.g. sub)"
        options={buildOptions('sub', claimsSupported, claimAliases)}
        isReadOnly={isReadOnly}
      />
      <ClaimField
        control={control}
        name="claimMapping.email"
        label="Email claim"
        hint="IdP claim for the user email (e.g. email, mail, upn)"
        options={buildOptions('email', claimsSupported, claimAliases)}
        isReadOnly={isReadOnly}
      />
      <ClaimField
        control={control}
        name="claimMapping.username"
        label="Username claim"
        hint="IdP claim for the username (e.g. preferred_username)"
        options={buildOptions('username', claimsSupported, claimAliases)}
        isReadOnly={isReadOnly}
      />
      <ClaimField
        control={control}
        name="claimMapping.fullName"
        label="Full name claim"
        hint="IdP claim for the display name (e.g. name, displayName)"
        options={buildOptions('full_name', claimsSupported, claimAliases)}
        isReadOnly={isReadOnly}
      />
    </>
  )
}
