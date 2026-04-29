import {
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Switch,
  TextInput,
  Tooltip,
} from '@patternfly/react-core'
import { RhUiErrorIcon } from '@patternfly/react-icons'
import type { Control } from 'react-hook-form'
import { Controller } from 'react-hook-form'

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

type UserFormFieldsProps = {
  control: Control<UserFormData>
  isEdit: boolean
  isBuiltinUser?: boolean
  isBuiltinSelf?: boolean
  isFederatedUser?: boolean
  /** When set, the status toggle is disabled and this text is shown in a tooltip. */
  statusToggleDisabledReason?: string
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
        <ControlledTextField
          name="password"
          control={control}
          label="Password"
          fieldId="user-password"
          placeholder={isEdit ? 'Leave blank to keep current password' : 'Enter password'}
          type="password"
          isRequired={!isEdit}
          isDisabled={isBuiltinUser && !isBuiltinSelf}
        />
      )}
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
