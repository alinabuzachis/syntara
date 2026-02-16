import { TriggerTypeEnum } from '@ansible/nexus-contracts'
import { FormGroup, FormSelect, FormSelectOption, Stack, StackItem } from '@patternfly/react-core'
import type { ReactNode } from 'react'
import { useEffect, useMemo } from 'react'
import { Controller, FormProvider, useForm, useFormContext, useWatch } from 'react-hook-form'

import { DateRangeCadencePicker } from '../../../components/forms/DateRangeCadencePicker'

import { ActivityNameField } from './shared/ActivityNameField'
import { NodeFormContainer } from './shared/NodeFormContainer'
import { NodeFormTabsLayout } from './shared/NodeFormTabsLayout'

export interface TriggerFormData {
  name?: string
  triggerType: string
  scheduleType?: string
  interval?: string
}

interface TriggerNodeFormProps {
  onSubmit: (data: TriggerFormData) => void
  onCancel: () => void
  initialData?: Partial<TriggerFormData>
  submitButtonText?: string
  onHeaderContentChange?: (content: ReactNode | null) => void
}

function TriggerFormFields({
  submitButtonText,
  onHeaderContentChange,
}: {
  submitButtonText?: string
  onHeaderContentChange?: (content: ReactNode | null) => void
}) {
  const { control, register } = useFormContext<TriggerFormData>()
  const triggerType = useWatch({ control, name: 'triggerType' })
  const scheduleType = useWatch({ control, name: 'scheduleType' })

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
                  <DateRangeCadencePicker value={field.value || ''} onChange={field.onChange} required showTime />
                )}
              />
            </StackItem>
          )}
        </>
      )}
    </Stack>
  )

  return <NodeFormTabsLayout parametersContent={parametersContent} submitButtonText={submitButtonText} />
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
    defaultValues,
  })

  const handleSubmit = (data: TriggerFormData) => {
    const cleanedData: TriggerFormData = {
      name: data.name,
      triggerType: data.triggerType,
      scheduleType: data.triggerType === TriggerTypeEnum.SCHEDULED ? data.scheduleType : undefined,
      interval:
        data.triggerType === TriggerTypeEnum.SCHEDULED && data.scheduleType === 'interval' ? data.interval : undefined,
    }
    props.onSubmit(cleanedData)
  }

  return (
    <FormProvider {...methods}>
      <NodeFormContainer formId="trigger-node-form" onSubmit={methods.handleSubmit(handleSubmit)}>
        <TriggerFormFields
          submitButtonText={props.submitButtonText}
          onHeaderContentChange={props.onHeaderContentChange}
        />
      </NodeFormContainer>
    </FormProvider>
  )
}
