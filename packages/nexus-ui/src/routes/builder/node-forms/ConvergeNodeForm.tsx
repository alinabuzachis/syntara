import {
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  MenuToggle,
  Select,
  SelectList,
  SelectOption,
  Stack,
  StackItem,
  Switch,
  TextInput,
} from '@patternfly/react-core'
import { RhUiErrorIcon } from '@patternfly/react-icons'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Controller, FormProvider, useForm, useFormContext, useWatch } from 'react-hook-form'

import { timeUnitsToSeconds } from '../utils/timeUtils'

import {
  convergeFormSchema,
  type ConvergeFormData,
  type ConvergeStrategy,
  type RemainingBehavior,
} from './convergeFormSchema'
import { ActivityNameField } from './shared/ActivityNameField'
import { zodResolver } from './shared/formSchemaUtils'
import { NodeFormContainer } from './shared/NodeFormContainer'
import { NodeFormTabsLayout } from './shared/NodeFormTabsLayout'

export type { ConvergeFormData, ConvergeStrategy, RemainingBehavior }

/** Options for "Continue when criteria" dropdown */
const CONTINUE_WHEN_CRITERIA_OPTIONS: Array<{ label: string; value: ConvergeStrategy; disabled?: boolean }> = [
  { label: 'All branches reach this node', value: 'all' },
  { label: 'Any branches reach this node (not yet implemented)', value: 'any', disabled: true },
]

/** Options for "Behavior of remaining nodes" when strategy is 'any' */
const REMAINING_BEHAVIOR_OPTIONS: Array<{ label: string; value: 'continue' | 'cancel' }> = [
  { label: 'Continue running', value: 'continue' },
  { label: 'Cancel node runs from remaining paths', value: 'cancel' },
]

/** Options for "Timeout action" dropdown */
const TIMEOUT_ACTION_OPTIONS: Array<{ label: string; value: 'fail' | 'continue'; description: string }> = [
  {
    value: 'fail',
    label: 'Fail',
    description:
      'The automation will fail if the parameters set on this converge node are not met by the specified timeout time.',
  },
  {
    value: 'continue',
    label: 'Continue with partial data',
    description: 'The automation will continue ignoring the parameters set for this converge node.',
  },
]

interface ConvergeNodeFormProps {
  onSubmit: (data: ConvergeFormData) => void
  submitButtonText?: string
  initialData?: Partial<ConvergeFormData>
  onHeaderContentChange?: (content: ReactNode | null) => void
}

// eslint-disable-next-line max-lines-per-function
function ConvergeFormFields({
  submitButtonText,
  onHeaderContentChange,
  validationErrors,
}: {
  submitButtonText?: string
  onHeaderContentChange?: (content: ReactNode | null) => void
  validationErrors?: {
    strategy?: { message?: string }
    requiredPathCount?: { message?: string }
    remainingBehavior?: { message?: string }
    onTimeout?: { message?: string }
  }
}) {
  const {
    register,
    control,
    setValue,
    formState: { errors: contextErrors },
  } = useFormContext<ConvergeFormData>()
  const errors = validationErrors ?? contextErrors
  const strategy = useWatch({ control, name: 'strategy' })
  const timeoutEnabled = useWatch({ control, name: 'timeoutEnabled' })
  const [isTimeoutActionOpen, setIsTimeoutActionOpen] = useState(false)

  useEffect(() => {
    if (errors.strategy) document.getElementById('converge-strategy')?.focus()
  }, [errors.strategy])

  const nameField = useMemo(
    () => <ActivityNameField register={register} fieldId="converge-name" ariaLabel="Name" />,
    [register]
  )

  useEffect(() => {
    onHeaderContentChange?.(nameField)
    return () => {
      onHeaderContentChange?.(null)
    }
  }, [nameField, onHeaderContentChange])

  const parametersContent = (
    <Stack hasGutter>
      {!onHeaderContentChange && <ActivityNameField register={register} fieldId="converge-name" />}

      <StackItem>
        <FormGroup label="Continue when criteria" isRequired fieldId="converge-strategy">
          <Controller
            control={control}
            name="strategy"
            render={({ field }) => (
              <FormSelect
                id="converge-strategy"
                aria-label="Continue when criteria"
                value={field.value ?? ''}
                onChange={(_event, value) => field.onChange(value)}
                isRequired
                validated={errors.strategy ? 'error' : 'default'}
              >
                <FormSelectOption value="" label="Select continue when criteria" isPlaceholder />
                {CONTINUE_WHEN_CRITERIA_OPTIONS.map((option) => (
                  <FormSelectOption
                    key={option.value}
                    value={option.value}
                    label={option.label}
                    isDisabled={option.disabled}
                  />
                ))}
              </FormSelect>
            )}
          />
          {errors.strategy && (
            <FormHelperText>
              <HelperText>
                <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                  {errors.strategy.message}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          )}
        </FormGroup>
      </StackItem>

      {strategy === 'any' && (
        <>
          <StackItem>
            <FormGroup label="Required path count" isRequired fieldId="converge-requiredPathCount">
              <TextInput
                {...register('requiredPathCount', { valueAsNumber: true })}
                id="converge-requiredPathCount"
                type="number"
                min={1}
              />
              {errors.requiredPathCount && (
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                      {errors.requiredPathCount.message}
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              )}
            </FormGroup>
          </StackItem>

          <StackItem>
            <FormGroup label="Behavior of remaining nodes" isRequired fieldId="converge-remainingBehavior">
              <Controller
                control={control}
                name="remainingBehavior"
                render={({ field }) => (
                  <FormSelect
                    id="converge-remainingBehavior"
                    aria-label="Behavior of remaining nodes"
                    value={field.value ?? ''}
                    onChange={(_event, value) => field.onChange(value)}
                    isRequired
                  >
                    <FormSelectOption value="" label="Select behavior of remaining nodes" isPlaceholder />
                    {REMAINING_BEHAVIOR_OPTIONS.map((option) => (
                      <FormSelectOption key={option.value} value={option.value} label={option.label} />
                    ))}
                  </FormSelect>
                )}
              />
              {errors.remainingBehavior && (
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                      {errors.remainingBehavior.message}
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              )}
            </FormGroup>
          </StackItem>
        </>
      )}

      <StackItem>
        <Switch
          id="converge-timeoutEnabled"
          label="Timeout"
          isChecked={timeoutEnabled ?? false}
          onChange={(_event, checked) => setValue('timeoutEnabled', checked)}
          aria-label="Timeout"
        />
      </StackItem>

      {timeoutEnabled && (
        <>
          <StackItem>
            <FormGroup label="Second(s)" fieldId="converge-timeout-seconds">
              <TextInput
                {...register('timeoutSeconds', { valueAsNumber: true })}
                id="converge-timeout-seconds"
                placeholder="Enter number of seconds"
                type="number"
                min={0}
              />
            </FormGroup>
          </StackItem>

          <StackItem>
            <FormGroup label="Minute(s)" fieldId="converge-timeout-minutes">
              <TextInput
                {...register('timeoutMinutes', { valueAsNumber: true })}
                id="converge-timeout-minutes"
                placeholder="Enter number of minutes"
                type="number"
                min={0}
              />
            </FormGroup>
          </StackItem>

          <StackItem>
            <FormGroup label="Hour(s)" fieldId="converge-timeout-hours">
              <TextInput
                {...register('timeoutHours', { valueAsNumber: true })}
                id="converge-timeout-hours"
                placeholder="Enter number of hours"
                type="number"
                min={0}
              />
            </FormGroup>
          </StackItem>

          <StackItem>
            <FormGroup label="Day(s)" fieldId="converge-timeout-days">
              <TextInput
                {...register('timeoutDays', { valueAsNumber: true })}
                id="converge-timeout-days"
                placeholder="Enter number of days"
                type="number"
                min={0}
              />
            </FormGroup>
          </StackItem>

          <StackItem>
            <FormGroup label="Timeout action" isRequired fieldId="converge-timeoutAction">
              <Controller
                control={control}
                name="onTimeout"
                render={({ field }) => (
                  <Select
                    id="converge-timeoutAction"
                    isOpen={isTimeoutActionOpen}
                    onOpenChange={setIsTimeoutActionOpen}
                    popperProps={{ minWidth: 'trigger', maxWidth: 'trigger' }}
                    onSelect={(_event, value) => {
                      field.onChange(value)
                      setIsTimeoutActionOpen(false)
                    }}
                    selected={field.value}
                    toggle={(toggleRef) => (
                      <MenuToggle
                        ref={toggleRef}
                        onClick={() => setIsTimeoutActionOpen(!isTimeoutActionOpen)}
                        isExpanded={isTimeoutActionOpen}
                        isFullWidth
                      >
                        {TIMEOUT_ACTION_OPTIONS.find((o) => o.value === field.value)?.label ?? 'Select timeout action'}
                      </MenuToggle>
                    )}
                  >
                    <SelectList>
                      {TIMEOUT_ACTION_OPTIONS.map((option) => (
                        <SelectOption key={option.value} value={option.value} description={option.description}>
                          {option.label}
                        </SelectOption>
                      ))}
                    </SelectList>
                  </Select>
                )}
              />
              {errors.onTimeout && (
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                      {errors.onTimeout.message}
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              )}
            </FormGroup>
          </StackItem>
        </>
      )}
    </Stack>
  )

  return <NodeFormTabsLayout parametersContent={parametersContent} submitButtonText={submitButtonText} />
}

export function ConvergeNodeForm(props: ConvergeNodeFormProps) {
  const defaultValues: ConvergeFormData = {
    name: '',
    strategy: 'all',
    timeoutEnabled: false,
    onTimeout: 'fail',
    requiredPathCount: 1,
    ...props.initialData,
  }

  const handleSubmit = (data: ConvergeFormData) => {
    // Convert time units to seconds (preserves 0 as valid timeout value)
    const timeout = data.timeoutEnabled
      ? timeUnitsToSeconds(
          Number(data.timeoutSeconds) || 0,
          Number(data.timeoutMinutes) || 0,
          Number(data.timeoutHours) || 0,
          Number(data.timeoutDays) || 0
        )
      : undefined

    const cleanedData: ConvergeFormData = {
      name: data.name,
      strategy: data.strategy,
      timeout,
      onTimeout: timeout !== undefined ? data.onTimeout : undefined,
      requiredPathCount: data.strategy === 'any' ? data.requiredPathCount : undefined,
      remainingBehavior: data.strategy === 'any' ? data.remainingBehavior : undefined,
    }

    props.onSubmit(cleanedData)
  }

  const methods = useForm<ConvergeFormData>({
    resolver: zodResolver(convergeFormSchema, undefined, { mode: 'sync' }),
    defaultValues,
  })

  const {
    formState: { errors },
  } = methods

  return (
    <FormProvider {...methods}>
      <NodeFormContainer formId="converge-node-form" onSubmit={methods.handleSubmit(handleSubmit)}>
        <ConvergeFormFields
          submitButtonText={props.submitButtonText}
          onHeaderContentChange={props.onHeaderContentChange}
          validationErrors={errors}
        />
      </NodeFormContainer>
    </FormProvider>
  )
}
