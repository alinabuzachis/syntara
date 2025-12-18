import {
  Controller,
  DateRangeCadencePicker,
  Form,
  NativeSelect,
  useFormContext,
  useWatch,
} from '@ansible/nexus-ui-framework'
import { Button, FormGroup, Stack, StackItem } from '@patternfly/react-core'

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
  const { register, control } = useFormContext<TriggerFormData>()
  const triggerType = useWatch({ control, name: 'triggerType' })
  const scheduleType = useWatch({ control, name: 'scheduleType' })

  return (
    <Stack hasGutter>
      <StackItem>
        <FormGroup label="Trigger Type" fieldId="trigger-type">
          <NativeSelect {...register('triggerType')} id="trigger-type">
            <option value="manual">Manual</option>
            <option value="scheduled">Scheduled</option>
          </NativeSelect>
        </FormGroup>
      </StackItem>

      {triggerType === 'scheduled' && (
        <>
          <StackItem>
            <FormGroup label="Schedule Type" fieldId="schedule-type">
              <NativeSelect {...register('scheduleType')} id="schedule-type">
                <option value="interval">Interval</option>
                <option value="continuous">Continuous</option>
              </NativeSelect>
            </FormGroup>
          </StackItem>

          {scheduleType === 'interval' && (
            <StackItem>
              <FormGroup label="Interval" fieldId="trigger-interval" isRequired>
                <Controller
                  control={control}
                  name="interval"
                  render={({ field }) => (
                    <DateRangeCadencePicker value={field.value || ''} onChange={field.onChange} required showTime />
                  )}
                />
              </FormGroup>
            </StackItem>
          )}
        </>
      )}

      <StackItem>
        <Button type="submit" variant="primary" style={{ width: '100%' }}>
          {submitButtonText ?? 'Add node'}
        </Button>
      </StackItem>
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

  const handleSubmit = (data: TriggerFormData) => {
    const cleanedData: TriggerFormData = {
      triggerType: data.triggerType,
      scheduleType: data.triggerType === 'scheduled' ? data.scheduleType : undefined,
      interval: data.triggerType === 'scheduled' && data.scheduleType === 'interval' ? data.interval : undefined,
    }
    props.onSubmit(cleanedData)
  }

  return (
    <Form<TriggerFormData> id="trigger-node-form" defaultValues={defaultValues} onSubmit={handleSubmit}>
      {() => <TriggerFormFields submitButtonText={props.submitButtonText} />}
    </Form>
  )
}
