import { FormGroup, FormHelperText, HelperText, HelperTextItem, Switch, TextInput } from '@patternfly/react-core'
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
}

export function UserFormFields({ control, isEdit }: Readonly<UserFormFieldsProps>) {
  return (
    <>
      <ControlledTextField
        name="username"
        control={control}
        label="Username"
        fieldId="user-username"
        placeholder="Enter username"
        isRequired
        isDisabled={isEdit}
      />
      <ControlledTextField
        name="first_name"
        control={control}
        label="First Name"
        fieldId="user-first-name"
        placeholder="Enter first name"
        isRequired
      />
      <ControlledTextField
        name="last_name"
        control={control}
        label="Last Name"
        fieldId="user-last-name"
        placeholder="Enter last name"
        isRequired
      />
      <ControlledTextField
        name="email"
        control={control}
        label="Email"
        fieldId="user-email"
        placeholder="Enter email address"
        isRequired
      />
      <ControlledTextField
        name="password"
        control={control}
        label="Password"
        fieldId="user-password"
        placeholder={isEdit ? 'Leave blank to keep current password' : 'Enter password'}
        type="password"
        isRequired={!isEdit}
      />
      <Controller
        name="is_active"
        control={control}
        render={({ field }) => (
          <FormGroup label="Status" fieldId="user-is-active">
            <Switch
              id="user-is-active"
              aria-label="Active"
              label={field.value ? 'Active' : 'Inactive'}
              isChecked={field.value}
              onChange={(_event, checked) => field.onChange(checked)}
            />
          </FormGroup>
        )}
      />
    </>
  )
}
