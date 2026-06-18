import {
  Button,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  InputGroup,
  InputGroupItem,
  LabelGroup,
  MenuToggle,
  Select,
  SelectList,
  SelectOption,
  Switch,
  TextInput,
  TextInputGroup,
  TextInputGroupMain,
  TextInputGroupUtilities,
  Tooltip,
} from '@patternfly/react-core'
import { RhUiCloseIcon, RhUiErrorIcon, RhUiViewIcon, RhUiViewOffIcon } from '@patternfly/react-icons'
import { type Ref, useMemo, useRef, useState } from 'react'
import type { Control, ControllerFieldState, ControllerRenderProps } from 'react-hook-form'
import { Controller } from 'react-hook-form'

import { NxLabel } from '../../../components/labels/NxLabel'
import { useAllGroups } from '../../access/useAllGroups'
import { PASSWORD_CHARACTER_CLASSES_MESSAGE, PASSWORD_MIN_LENGTH_MESSAGE } from '../passwordComplexity'
import type { UserFormData } from '../userFormSchema'

type ControlledTextFieldProps = {
  name: 'username' | 'first_name' | 'last_name' | 'email' | 'password'
  control: Control<UserFormData>
  label: string
  fieldId: string
  placeholder?: string
  isRequired?: boolean
  isDisabled?: boolean
  type?: 'text' | 'email' | 'password' | 'search' | 'tel' | 'url' | 'date' | 'time' | 'number'
}

function ControlledTextField({
  name,
  control,
  label,
  fieldId,
  placeholder,
  isRequired,
  isDisabled,
  type,
}: Readonly<ControlledTextFieldProps>) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <FormGroup label={label} fieldId={fieldId} isRequired={isRequired}>
          <TextInput
            id={fieldId}
            aria-label={label}
            placeholder={placeholder}
            type={type}
            validated={fieldState.error ? 'error' : 'default'}
            isDisabled={isDisabled}
            value={field.value ?? ''}
            onChange={field.onChange}
            onBlur={field.onBlur}
            name={field.name}
          />
          {fieldState.error && (
            <FormHelperText>
              <HelperText>
                <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                  {fieldState.error.message}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          )}
        </FormGroup>
      )}
    />
  )
}

type GroupOption = {
  name: string
  description: string | null
}

function GroupMultiSelect({
  selected,
  onChange,
  isLoading,
  groupOptions,
}: Readonly<{
  selected: string[]
  onChange: (names: string[]) => void
  isLoading: boolean
  groupOptions: GroupOption[]
}>) {
  const [isOpen, setIsOpen] = useState(false)
  const [filterValue, setFilterValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const filteredOptions = useMemo(() => {
    if (!filterValue) return groupOptions
    const term = filterValue.toLowerCase()
    return groupOptions.filter((o) => o.name.toLowerCase().includes(term))
  }, [groupOptions, filterValue])

  const handleSelect = (_event: React.MouseEvent | undefined, value: string | number | undefined) => {
    if (!value) return
    const name = String(value)
    if (selected.includes(name)) {
      onChange(selected.filter((n) => n !== name))
    } else {
      onChange([...selected, name])
    }
    inputRef.current?.focus()
  }

  const handleRemoveGroup = (e: React.MouseEvent, name: string) => {
    e.stopPropagation()
    onChange(selected.filter((n) => n !== name))
  }

  const handleClear = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    onChange([])
    setFilterValue('')
    inputRef.current?.focus()
  }

  const handleFilterChange = (_e: React.SyntheticEvent, val: string) => {
    setFilterValue(val)
    if (!isOpen) setIsOpen(true)
  }

  const handleInputClick = () => {
    if (!isOpen) setIsOpen(true)
  }

  const toggle = (toggleRef: Ref<HTMLButtonElement>) => (
    <MenuToggle ref={toggleRef} variant="typeahead" onClick={() => setIsOpen(!isOpen)} isExpanded={isOpen} isFullWidth>
      <TextInputGroup isPlain>
        <TextInputGroupMain
          value={filterValue}
          onChange={handleFilterChange}
          onClick={handleInputClick}
          placeholder={selected.length === 0 ? 'Select groups...' : ''}
          autoComplete="off"
          innerRef={inputRef}
          aria-label="Filter groups"
        >
          {selected.length > 0 && (
            <LabelGroup>
              {selected.map((name) => (
                <NxLabel key={name} color="blue" onClose={(e) => handleRemoveGroup(e, name)}>
                  {name}
                </NxLabel>
              ))}
            </LabelGroup>
          )}
        </TextInputGroupMain>
        {selected.length > 0 && (
          <TextInputGroupUtilities>
            <Button variant="plain" onClick={handleClear} aria-label="Clear all groups">
              <RhUiCloseIcon />
            </Button>
          </TextInputGroupUtilities>
        )}
      </TextInputGroup>
    </MenuToggle>
  )

  return (
    <Select
      id="user-groups-select"
      aria-label="Select groups"
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      onSelect={handleSelect}
      selected={selected}
      toggle={toggle}
    >
      <SelectList style={{ maxHeight: '200px', overflow: 'auto' }}>
        {isLoading && <SelectOption isDisabled>Loading...</SelectOption>}
        {!isLoading && filteredOptions.length === 0 && (
          <SelectOption isDisabled>
            {filterValue ? `No results match "${filterValue}"` : 'No groups available'}
          </SelectOption>
        )}
        {!isLoading &&
          filteredOptions.map((group) => (
            <SelectOption
              key={group.name}
              value={group.name}
              hasCheckbox
              isSelected={selected.includes(group.name)}
              description={group.description ?? undefined}
            >
              {group.name}
            </SelectOption>
          ))}
      </SelectList>
    </Select>
  )
}

type UserFormFieldsProps = {
  control: Control<UserFormData>
  isEdit: boolean
  isBuiltinUser?: boolean
  isBuiltinSelf?: boolean
  isFederatedUser?: boolean
  /** When set, the status toggle is disabled and this text is shown in a tooltip. */
  statusToggleDisabledReason?: string
}

function GroupField({ control }: Readonly<{ control: Control<UserFormData> }>) {
  const { groups, isLoading: isLoadingGroups } = useAllGroups()
  const groupOptions = useMemo(
    () => groups.map((g) => ({ name: g.name, description: g.description ?? null })),
    [groups]
  )
  return (
    <Controller
      name="group_names"
      control={control}
      render={({ field }) => (
        <FormGroup label="Groups" fieldId="user-groups-select">
          <GroupMultiSelect
            selected={field.value ?? []}
            onChange={field.onChange}
            isLoading={isLoadingGroups}
            groupOptions={groupOptions}
          />
        </FormGroup>
      )}
    />
  )
}

type PasswordFieldInputProps = {
  field: ControllerRenderProps<UserFormData, 'password'>
  fieldState: ControllerFieldState
  isEdit: boolean
  isDisabled: boolean
}

function PasswordFieldInput({ field, fieldState, isEdit, isDisabled }: Readonly<PasswordFieldInputProps>) {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const validated = fieldState.error ? 'error' : 'default'
  const placeholder = isEdit ? 'Leave blank to keep current password' : 'Enter password'

  return (
    <>
      <InputGroup>
        <InputGroupItem isFill>
          <TextInput
            id="user-password"
            aria-label="Password"
            placeholder={placeholder}
            type={isPasswordVisible ? 'text' : 'password'}
            validated={validated}
            isDisabled={isDisabled}
            value={field.value ?? ''}
            onChange={field.onChange}
            onBlur={field.onBlur}
            name={field.name}
          />
        </InputGroupItem>
        <InputGroupItem>
          <Button
            variant="control"
            isDisabled={isDisabled}
            onClick={() => setIsPasswordVisible((visible) => !visible)}
            aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
          >
            {isPasswordVisible ? <RhUiViewOffIcon /> : <RhUiViewIcon />}
          </Button>
        </InputGroupItem>
      </InputGroup>
      {!fieldState.error && (
        <FormHelperText>
          <HelperText>
            <HelperTextItem>{PASSWORD_MIN_LENGTH_MESSAGE}</HelperTextItem>
            <HelperTextItem>{PASSWORD_CHARACTER_CLASSES_MESSAGE}</HelperTextItem>
          </HelperText>
        </FormHelperText>
      )}
      {fieldState.error && (
        <FormHelperText>
          <HelperText>
            <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
              {fieldState.error.message}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      )}
    </>
  )
}

export function UserFormFields({
  control,
  isEdit,
  isBuiltinUser = false,
  isBuiltinSelf = false,
  isFederatedUser = false,
  statusToggleDisabledReason,
}: Readonly<UserFormFieldsProps>) {
  return (
    <>
      <ControlledTextField
        name="username"
        control={control}
        label="Username"
        fieldId="user-username"
        placeholder="Enter username"
        isRequired
        isDisabled={isBuiltinUser}
      />
      <ControlledTextField
        name="first_name"
        control={control}
        label="First Name"
        fieldId="user-first-name"
        placeholder="Enter first name"
        isRequired
        isDisabled={isBuiltinUser}
      />
      <ControlledTextField
        name="last_name"
        control={control}
        label="Last Name"
        fieldId="user-last-name"
        placeholder="Enter last name"
        isDisabled={isBuiltinUser}
      />
      <ControlledTextField
        name="email"
        control={control}
        label="Email"
        fieldId="user-email"
        placeholder="Enter email address"
        isDisabled={isBuiltinUser}
      />
      {!isFederatedUser && (
        <Controller
          name="password"
          control={control}
          render={({ field, fieldState }) => (
            <FormGroup label="Password" fieldId="user-password" isRequired={!isEdit}>
              <PasswordFieldInput
                field={field}
                fieldState={fieldState}
                isEdit={isEdit}
                isDisabled={isBuiltinUser && !isBuiltinSelf}
              />
            </FormGroup>
          )}
        />
      )}
      {!isEdit && <GroupField control={control} />}
      <Controller
        name="is_enabled"
        control={control}
        render={({ field }) => {
          const statusSwitch = (
            <Switch
              id="user-is-enabled"
              aria-label="Enabled"
              label={field.value ? 'Enabled' : 'Disabled'}
              isChecked={field.value}
              isDisabled={!!statusToggleDisabledReason}
              onChange={(_event, checked) => field.onChange(checked)}
            />
          )

          return (
            <FormGroup label="Status" fieldId="user-is-enabled">
              {statusToggleDisabledReason ? (
                <Tooltip content={statusToggleDisabledReason}>
                  {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
                  <span tabIndex={0}>{statusSwitch}</span>
                </Tooltip>
              ) : (
                statusSwitch
              )}
            </FormGroup>
          )
        }}
      />
    </>
  )
}
