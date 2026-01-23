import { Form, FormGroup, FormSelect, FormSelectOption, Stack, StackItem } from '@patternfly/react-core'
import { Controller, FormProvider, useForm, useFormContext, useWatch } from 'react-hook-form'

import { DateRangeCadencePicker } from '../../../components/forms/DateRangeCadencePicker'

import { FormSubmitButton } from './shared/FormSubmitButton'

export interface TriggerFormData {
  triggerType: string
  scheduleType?: string
  interval?: string
}

interface TriggerNodeFormProps {
  onSubmit: (data: TriggerFormData) => void
  onCancel: () => void
  initialData?: TriggerFormData
  submitButtonText?: string
}

function TriggerFormFields({ submitButtonText }: { submitButtonText?: string }) {
  const { control } = useFormContext<TriggerFormData>()
  const triggerType = useWatch({ control, name: 'triggerType' })
  const scheduleType = useWatch({ control, name: 'scheduleType' })

  return (
    <Stack hasGutter>
      <StackItem>
        <FormGroup label="Trigger type" fieldId="trigger-type">
          <Controller
            control={control}
            name="triggerType"
            render={({ field }) => (
              <FormSelect
                id="trigger-type"
                aria-label="Trigger type"
                value={field.value}
                onChange={(_event, value) => field.onChange(value)}
              >
                <FormSelectOption value="manual" label="Manual" />
                <FormSelectOption value="scheduled" label="Scheduled" />
              </FormSelect>
            )}
          />
        </FormGroup>
      </StackItem>

      {triggerType === 'scheduled' && (
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
              {/* <FormGroup label="Interval" fieldId="trigger-interval" isRequired> */}
              <Controller
                control={control}
                name="interval"
                render={({ field }) => (
                  <DateRangeCadencePicker value={field.value || ''} onChange={field.onChange} required showTime />
                )}
              />
              {/* </FormGroup> */}
            </StackItem>
          )}
        </>
      )}

      <FormSubmitButton submitButtonText={submitButtonText} />
    </Stack>
  )
}

export function TriggerNodeForm(props: TriggerNodeFormProps) {
  const defaultValues: TriggerFormData = {
    triggerType: 'manual',
    scheduleType: 'interval',
    interval: '',
    ...props.initialData,
  }

  const methods = useForm<TriggerFormData>({
    defaultValues,
  })

  const handleSubmit = (data: TriggerFormData) => {
    const cleanedData: TriggerFormData = {
      triggerType: data.triggerType,
      scheduleType: data.triggerType === 'scheduled' ? data.scheduleType : undefined,
      interval: data.triggerType === 'scheduled' && data.scheduleType === 'interval' ? data.interval : undefined,
    }
    props.onSubmit(cleanedData)
  }

  return (
    <FormProvider {...methods}>
      <Form id="trigger-node-form" onSubmit={methods.handleSubmit(handleSubmit)}>
        <TriggerFormFields submitButtonText={props.submitButtonText} />
      </Form>
    </FormProvider>
  )
}
