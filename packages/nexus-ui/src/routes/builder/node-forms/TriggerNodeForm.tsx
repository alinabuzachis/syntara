import {
  Button,
  Card,
  Checkbox,
  Controller,
  DateRangeCadencePicker,
  Form,
  NativeSelect,
  useFormContext,
  useWatch,
} from '@ansible/nexus-ui-framework'

export interface TriggerFormData {
  triggerType: string
  requiresApproval?: boolean
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
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="trigger-type" className="text-xs font-medium text-gray-300">
          Trigger Type
        </label>
        <NativeSelect {...register('triggerType')} id="trigger-type">
          <option value="manual">Manual</option>
          <option value="scheduled">Scheduled</option>
        </NativeSelect>
      </div>

      {triggerType === 'manual' && (
        <Controller
          control={control}
          name="requiresApproval"
          render={({ field }) => (
            <Checkbox checked={field.value} onCheckedChange={field.onChange} label="Requires Approval" />
          )}
        />
      )}

      {triggerType === 'scheduled' && (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="schedule-type" className="text-xs font-medium text-gray-300">
              Schedule Type
            </label>
            <NativeSelect {...register('scheduleType')} id="schedule-type">
              <option value="interval">Interval</option>
              <option value="continuous">Continuous</option>
            </NativeSelect>
          </div>

          {scheduleType === 'interval' && (
            <Controller
              control={control}
              name="interval"
              render={({ field }) => (
                <DateRangeCadencePicker value={field.value || ''} onChange={field.onChange} required showTime />
              )}
            />
          )}
        </>
      )}

      <Button type="submit" variant="primary" className="w-full justify-center text-xs">
        {submitButtonText ?? 'Add node'}
      </Button>
    </>
  )
}

export function TriggerNodeForm(props: TriggerNodeFormProps) {
  const defaultValues: TriggerFormData = {
    triggerType: 'manual',
    requiresApproval: false,
    scheduleType: 'interval',
    interval: '',
    ...props.initialData,
  }

  const handleSubmit = (data: TriggerFormData) => {
    const cleanedData: TriggerFormData = {
      triggerType: data.triggerType,
      requiresApproval: data.triggerType === 'manual' ? data.requiresApproval : undefined,
      scheduleType: data.triggerType === 'scheduled' ? data.scheduleType : undefined,
      interval: data.triggerType === 'scheduled' && data.scheduleType === 'interval' ? data.interval : undefined,
    }
    props.onSubmit(cleanedData)
  }

  return (
    <Card variant="glass" padding="md" className="flex flex-col gap-3">
      <Form<TriggerFormData>
        id="trigger-node-form"
        defaultValues={defaultValues}
        onSubmit={handleSubmit}
        className="flex flex-col gap-3"
      >
        {() => <TriggerFormFields submitButtonText={props.submitButtonText} />}
      </Form>
    </Card>
  )
}
