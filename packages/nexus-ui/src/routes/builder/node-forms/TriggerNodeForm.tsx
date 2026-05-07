import { TriggerTypeEnum } from '@ansible/nexus-contracts'
import {
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Stack,
  StackItem,
} from '@patternfly/react-core'
import type { ReactNode } from 'react'
import { useEffect, useMemo } from 'react'
import { Controller, FormProvider, useForm, useFormContext, useWatch } from 'react-hook-form'

import { ExpandableCodeEditor } from '../../../components/ExpandableCodeEditor'
import { DateRangeCadencePicker } from '../../../components/forms/DateRangeCadencePicker'
import { JsonEditorControls } from '../../../components/JsonEditorToolbar'

import { ActivityNameField } from './shared/ActivityNameField'
import { zodResolver } from './shared/formSchemaUtils'
import { NodeFormContainer } from './shared/NodeFormContainer'
import { NodeFormTabsLayout } from './shared/NodeFormTabsLayout'
import { triggerFormSchema, type TriggerFormData } from './triggerFormSchema'

export type { TriggerFormData }

const EXAMPLE_INPUT_SCHEMA = JSON.stringify(
  {
    type: 'object',
    properties: {
      name: { type: 'string' },
    },
    required: ['name'],
  },
  null,
  2
)

type TriggerNodeFormProps = {
  onSubmit: (data: TriggerFormData) => void
  initialData?: Partial<TriggerFormData>
  onHeaderContentChange?: (content: ReactNode | null) => void
}

function TriggerFormFields({
  onHeaderContentChange,
  validationErrors,
}: {
  onHeaderContentChange?: (content: ReactNode | null) => void
  validationErrors?: { interval?: { message?: string } }
}) {
  const {
    control,
    register,
    formState: { errors: contextErrors },
  } = useFormContext<TriggerFormData>()
  const errors = validationErrors ?? contextErrors
  const triggerType = useWatch({ control, name: 'triggerType' })
  const scheduleType = useWatch({ control, name: 'scheduleType' })

  useEffect(() => {
    if (errors.interval) document.getElementById('cadence-start')?.focus()
  }, [errors.interval])

  const nameField = useMemo(
    () => (
      <ActivityNameField<TriggerFormData>
        register={register}
        fieldId="trigger-name"
        placeholder="Enter trigger name"
        ariaLabel="Name"
      />
    ),
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
      <input type="hidden" {...register('triggerType')} />

      {triggerType === TriggerTypeEnum.MANUAL_TRIGGER && (
        <StackItem>
          <FormGroup label="Input schema" fieldId="trigger-input-schema">
            <Controller
              control={control}
              name="inputSchema"
              render={({ field }) => (
                <ExpandableCodeEditor
                  code={field.value ?? ''}
                  onCodeChange={field.onChange}
                  language="json"
                  height="150px"
                  modalTitle="Edit input schema"
                  ariaLabel="Input schema editor"
                  additionalControls={
                    <JsonEditorControls
                      code={field.value ?? ''}
                      onCodeChange={field.onChange}
                      defaultCode={''}
                      downloadFilename="input-schema.json"
                      exampleCode={EXAMPLE_INPUT_SCHEMA}
                    />
                  }
                />
              )}
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>
                  Optional JSON Schema defining the input data required to run this workflow.
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>
        </StackItem>
      )}

      {triggerType === TriggerTypeEnum.SCHEDULED && (
        <>
          <StackItem>
            <FormGroup label="Schedule type" fieldId="schedule-type">
              <Controller
                control={control}
                name="scheduleType"
                render={({ field }) => (
                  <FormSelect
                    id="schedule-type"
                    aria-label="Schedule type"
                    value={field.value}
                    onChange={(_event, value) => field.onChange(value)}
                  >
                    <FormSelectOption value="interval" label="Interval" />
                    <FormSelectOption value="continuous" label="Continuous" />
                  </FormSelect>
                )}
              />
            </FormGroup>
          </StackItem>

          {scheduleType === 'interval' && (
            <StackItem>
              <Controller
                control={control}
                name="interval"
                render={({ field }) => (
                  <DateRangeCadencePicker
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    required
                    showTime
                    error={!!errors.interval}
                    errorMessage={errors.interval?.message}
                  />
                )}
              />
            </StackItem>
          )}
        </>
      )}
    </Stack>
  )

  return <NodeFormTabsLayout parametersContent={parametersContent} />
}

export function TriggerNodeForm(props: TriggerNodeFormProps) {
  const defaultValues: TriggerFormData = {
    name: '',
    triggerType: props.initialData?.triggerType ?? 'manual',
    scheduleType: 'interval',
    interval: '',
    ...props.initialData,
  }

  const methods = useForm<TriggerFormData>({
    resolver: zodResolver(triggerFormSchema, undefined, { mode: 'sync' }),
    defaultValues,
  })

  const {
    formState: { errors },
  } = methods

  const handleSubmit = (data: TriggerFormData) => {
    const cleanedData: TriggerFormData = {
      name: data.name,
      triggerType: data.triggerType,
      inputSchema: data.triggerType === TriggerTypeEnum.MANUAL_TRIGGER ? data.inputSchema : undefined,
      scheduleType: data.triggerType === TriggerTypeEnum.SCHEDULED ? data.scheduleType : undefined,
      interval:
        data.triggerType === TriggerTypeEnum.SCHEDULED && data.scheduleType === 'interval' ? data.interval : undefined,
    }
    props.onSubmit(cleanedData)
  }

  return (
    <FormProvider {...methods}>
      <NodeFormContainer formId="trigger-node-form" onSubmit={methods.handleSubmit(handleSubmit)}>
        <TriggerFormFields onHeaderContentChange={props.onHeaderContentChange} validationErrors={errors} />
      </NodeFormContainer>
    </FormProvider>
  )
}
