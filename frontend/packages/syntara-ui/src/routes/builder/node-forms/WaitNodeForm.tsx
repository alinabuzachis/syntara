import { FormGroup, FormHelperText, HelperText, HelperTextItem, Stack, StackItem } from '@patternfly/react-core'
import type { ReactNode } from 'react'
import { use, useEffect, useMemo } from 'react'
import { Controller, FormProvider, useForm, useFormContext, useFormState } from 'react-hook-form'

import { NodeEditorAutoSubmitContext, useRegisterAutoSubmit } from '../hooks/useNodeEditorAutoSubmit'
import { useIsVersionView } from '../VersionViewContext'

import { ActivityNameField } from './shared/ActivityNameField'
import { DurationInput } from './shared/DurationInput'
import { zodResolver } from './shared/formSchemaUtils'
import { nodeHelp } from './shared/nodeFieldHelp'
import { NodeFormContainer } from './shared/NodeFormContainer'
import { NodeFormTabsLayout } from './shared/NodeFormTabsLayout'
import { NodeSettingsForm } from './shared/NodeSettingsForm'
import { useMaxWaitDuration } from './useMaxWaitDuration'
import { createWaitFormSchema, type WaitFormData } from './waitFormSchema'

export type { WaitFormData }

type WaitNodeFormProps = {
  onSubmit: (data: WaitFormData) => void
  initialData?: Partial<WaitFormData>
  onHeaderContentChange?: (content: ReactNode | null) => void
}

type WaitFormFieldsProps = Readonly<{
  onHeaderContentChange?: (content: ReactNode | null) => void
}>

function WaitFormFields({ onHeaderContentChange }: WaitFormFieldsProps) {
  const isVersionView = useIsVersionView()
  const { register, control } = useFormContext<WaitFormData>()
  const { errors } = useFormState<WaitFormData>()

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

  const durationError = errors.duration

  const parametersContent = (
    <Stack hasGutter>
      {!onHeaderContentChange && <ActivityNameField register={register} fieldId="wait-name" />}

      <StackItem>
        <FormGroup label="Wait duration" labelHelp={nodeHelp.waitDuration} fieldId="wait-duration" isRequired>
          <Controller
            control={control}
            name="duration"
            render={({ field }) => (
              <DurationInput
                value={field.value}
                onChange={field.onChange}
                idPrefix="wait"
                isDisabled={isVersionView}
                validated={durationError ? 'error' : undefined}
              />
            )}
          />
          {durationError && (
            <FormHelperText>
              <HelperText>
                <HelperTextItem variant="error">{durationError.message}</HelperTextItem>
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
    duration: undefined,
    ...props.initialData,
  }

  const methods = useForm<WaitFormData>({
    resolver: zodResolver(schema, undefined, { mode: 'sync' }),
    defaultValues,
    mode: 'onChange',
  })

  const autoSubmitRef = use(NodeEditorAutoSubmitContext)
  useRegisterAutoSubmit(autoSubmitRef, methods, props.onSubmit)

  if (isLoading) return null

  return (
    <FormProvider {...methods}>
      <NodeFormContainer formId="wait-node-form" onSubmit={methods.handleSubmit(props.onSubmit)}>
        <WaitFormFields onHeaderContentChange={props.onHeaderContentChange} />
      </NodeFormContainer>
    </FormProvider>
  )
}
