import {
  Content,
  Flex,
  FlexItem,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Stack,
  StackItem,
  TextInput,
} from '@patternfly/react-core'
import type { ReactNode } from 'react'
import { useEffect, useMemo } from 'react'
import type { FieldErrors } from 'react-hook-form'
import { FormProvider, useForm, useFormContext } from 'react-hook-form'

import { ActivityNameField } from './shared/ActivityNameField'
import { zodResolver } from './shared/formSchemaUtils'
import { NodeFormContainer } from './shared/NodeFormContainer'
import { NodeFormTabsLayout } from './shared/NodeFormTabsLayout'
import { NodeSettingsForm } from './shared/NodeSettingsForm'
import { useMaxWaitDuration } from './useMaxWaitDuration'
import { createWaitFormSchema, type WaitFormData } from './waitFormSchema'
import styles from './WaitNodeForm.module.css'

export type { WaitFormData }

type WaitNodeFormProps = {
  onSubmit: (data: WaitFormData) => void
  initialData?: Partial<WaitFormData>
  onHeaderContentChange?: (content: ReactNode | null) => void
}

type DurationFieldProps = {
  name: 'days' | 'hours' | 'minutes' | 'seconds'
  label: string
  max?: number
  hasGroupError?: boolean
}

function DurationField({ name, label, max, hasGroupError }: Readonly<DurationFieldProps>) {
  const {
    register,
    formState: { errors },
  } = useFormContext<WaitFormData>()

  const fieldError = errors[name]
  const isRefinementError = fieldError?.type === 'custom'
  const hasFieldError = fieldError && !isRefinementError
  const showError = hasFieldError || hasGroupError

  return (
    <FlexItem>
      <TextInput
        {...register(name, { valueAsNumber: true })}
        id={`wait-${name}`}
        type="number"
        min={0}
        max={max}
        placeholder="00"
        aria-label={label}
        validated={showError ? 'error' : 'default'}
        className={styles.durationInput}
      />
      <Content component="small" className={styles.durationLabel}>
        {label}
      </Content>
      {hasFieldError && (
        <FormHelperText>
          <HelperText>
            <HelperTextItem variant="error">{fieldError.message}</HelperTextItem>
          </HelperText>
        </FormHelperText>
      )}
    </FlexItem>
  )
}

type WaitFormFieldsProps = Readonly<{
  onHeaderContentChange?: (content: ReactNode | null) => void
  validationErrors?: FieldErrors<WaitFormData>
}>

function WaitFormFields({ onHeaderContentChange, validationErrors }: WaitFormFieldsProps) {
  const { register, formState } = useFormContext<WaitFormData>()

  const nameField = useMemo(
    () => <ActivityNameField register={register} fieldId="wait-name" ariaLabel="Name" />,
    [register]
  )

  useEffect(() => {
    onHeaderContentChange?.(nameField)
    return () => {
      onHeaderContentChange?.(null)
    }
  }, [nameField, onHeaderContentChange])

  const errors = validationErrors ?? formState.errors

  const refinementError =
    (errors.seconds?.type === 'custom' && errors.seconds) ||
    (errors.days?.type === 'custom' && errors.days) ||
    undefined

  const parametersContent = (
    <Stack hasGutter>
      {!onHeaderContentChange && <ActivityNameField register={register} fieldId="wait-name" />}

      <StackItem>
        <FormGroup label="Wait duration" fieldId="wait-duration" isRequired>
          <Flex gap={{ default: 'gapMd' }} flexWrap={{ default: 'nowrap' }}>
            <DurationField name="days" label="Days" hasGroupError={!!refinementError} />
            <DurationField name="hours" label="Hours" max={23} hasGroupError={!!refinementError} />
            <DurationField name="minutes" label="Minutes" max={59} hasGroupError={!!refinementError} />
            <DurationField name="seconds" label="Seconds" max={59} hasGroupError={!!refinementError} />
          </Flex>
          {refinementError && (
            <FormHelperText>
              <HelperText>
                <HelperTextItem variant="error">{refinementError.message}</HelperTextItem>
              </HelperText>
            </FormHelperText>
          )}
        </FormGroup>
      </StackItem>
    </Stack>
  )

  const settingsContent = <NodeSettingsForm supportsTimeout={false} supportsRetryPolicy={false} />

  return <NodeFormTabsLayout parametersContent={parametersContent} settingsContent={settingsContent} />
}

export function WaitNodeForm(props: Readonly<WaitNodeFormProps>) {
  const { maxSeconds, isLoading } = useMaxWaitDuration()

  const schema = useMemo(() => createWaitFormSchema(maxSeconds), [maxSeconds])

  const defaultValues: WaitFormData = {
    name: '',
    settings: {},
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    ...props.initialData,
  }

  const methods = useForm<WaitFormData>({
    resolver: zodResolver(schema, undefined, { mode: 'sync' }),
    defaultValues,
  })

  const {
    formState: { errors },
  } = methods

  if (isLoading) return null

  return (
    <FormProvider {...methods}>
      <NodeFormContainer formId="wait-node-form" onSubmit={methods.handleSubmit(props.onSubmit)}>
        <WaitFormFields onHeaderContentChange={props.onHeaderContentChange} validationErrors={errors} />
      </NodeFormContainer>
    </FormProvider>
  )
}
