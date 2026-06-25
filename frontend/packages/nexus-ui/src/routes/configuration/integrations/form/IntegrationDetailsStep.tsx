import {
  Content,
  ContentVariants,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  MenuToggle,
  type MenuToggleElement,
  Select,
  SelectList,
  SelectOption,
  Switch,
  TextInput,
  Title,
} from '@patternfly/react-core'
import { RhUiErrorIcon } from '@patternfly/react-icons'
import { type Ref, useState } from 'react'
import { Controller, useWatch, type Control, type UseFormSetValue } from 'react-hook-form'

import { INTEGRATION_TYPE_OPTIONS, type IntegrationFormData } from './integrationFormSchema'
import styles from './WizardSteps.module.css'

type ControlledTextFieldProps = Readonly<{
  control: Control<IntegrationFormData>
  name: 'name' | 'description' | 'configuration.base_url'
  label: string
  fieldId: string
  placeholder: string
  isRequired?: boolean
}>

function ControlledTextField({ control, name, label, fieldId, placeholder, isRequired }: ControlledTextFieldProps) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <FormGroup label={label} fieldId={fieldId} isRequired={isRequired}>
          <TextInput
            id={fieldId}
            placeholder={placeholder}
            aria-required={isRequired || undefined}
            validated={fieldState.error ? 'error' : 'default'}
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

function IntegrationTypeMenuToggle({
  toggleRef,
  value,
  onClick,
  isExpanded,
}: Readonly<{
  toggleRef: Ref<MenuToggleElement>
  value: string
  onClick: () => void
  isExpanded: boolean
}>) {
  const label = INTEGRATION_TYPE_OPTIONS.find((opt) => opt.value === value)?.label ?? value
  return (
    <MenuToggle ref={toggleRef} onClick={onClick} isExpanded={isExpanded} isFullWidth>
      {label}
    </MenuToggle>
  )
}

type IntegrationDetailsStepProps = Readonly<{
  control: Control<IntegrationFormData>
  setValue: UseFormSetValue<IntegrationFormData>
}>

export function IntegrationDetailsStep({ control, setValue }: IntegrationDetailsStepProps) {
  const scope = useWatch({ control, name: 'scope' })
  const [isTypeOpen, setIsTypeOpen] = useState(false)

  return (
    <>
      <Title headingLevel="h2" size="lg" className={styles.stepTitle}>
        Integration details
      </Title>
      <Content component={ContentVariants.p} className={styles.stepDescription}>
        Select an integration type and provide connection details.
      </Content>
      <Form className={styles.stepForm}>
        <FormGroup label="Integration type" fieldId="integration-type" isRequired>
          <Controller
            name="integration_type"
            control={control}
            render={({ field }) => (
              <Select
                id="integration-type"
                isOpen={isTypeOpen}
                selected={field.value}
                onSelect={(_event, value) => {
                  const validType = INTEGRATION_TYPE_OPTIONS.find((opt) => opt.value === value)
                  if (!validType) return
                  field.onChange(validType.value)
                  setValue('configuration.integration_type', validType.value)
                  setIsTypeOpen(false)
                }}
                onOpenChange={setIsTypeOpen}
                toggle={(toggleRef) => (
                  <IntegrationTypeMenuToggle
                    toggleRef={toggleRef}
                    value={field.value}
                    onClick={() => setIsTypeOpen((prev) => !prev)}
                    isExpanded={isTypeOpen}
                  />
                )}
                shouldFocusToggleOnSelect
              >
                <SelectList>
                  {INTEGRATION_TYPE_OPTIONS.map((opt) => (
                    <SelectOption key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectOption>
                  ))}
                </SelectList>
              </Select>
            )}
          />
        </FormGroup>
        <ControlledTextField
          control={control}
          name="name"
          label="Server name / ID"
          fieldId="name"
          placeholder="Enter server name / ID"
          isRequired
        />
        <ControlledTextField
          control={control}
          name="description"
          label="Description"
          fieldId="description"
          placeholder="Enter description"
        />
        <ControlledTextField
          control={control}
          name="configuration.base_url"
          label="Base URL"
          fieldId="base-url"
          placeholder="e.g. http://localhost:8765/mcp"
          isRequired
        />
        <FormGroup label="Scope" fieldId="integration-scope">
          <Controller
            name="scope"
            control={control}
            render={({ field }) => (
              <Switch
                id="integration-scope"
                label="Global"
                aria-label="Integration scope"
                hasCheckIcon
                isChecked={field.value === 'global'}
                onChange={(_event, checked) => field.onChange(checked ? 'global' : 'project')}
              />
            )}
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>
                {scope === 'global'
                  ? 'Global integrations are available to all projects. Turn off to scope this integration to specific projects.'
                  : 'This integration will only be available to selected projects.'}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </Form>
    </>
  )
}
