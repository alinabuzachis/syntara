import { Button, DateRangeCadencePicker } from '@ansible/nexus-ui-framework'
import { useState } from 'react'

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

export function TriggerNodeForm(props: TriggerNodeFormProps) {
  const { initialData, submitButtonText = 'Add node' } = props
  const [triggerType, setTriggerType] = useState(initialData?.triggerType || 'manual')
  const [requiresApproval, setRequiresApproval] = useState(initialData?.requiresApproval || false)
  const [scheduleType, setScheduleType] = useState(initialData?.scheduleType || 'interval')
  const [interval, setInterval] = useState(initialData?.interval || '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    props.onSubmit({
      triggerType,
      requiresApproval: triggerType === 'manual' ? requiresApproval : undefined,
      scheduleType: triggerType === 'scheduled' ? scheduleType : undefined,
      interval: triggerType === 'scheduled' && scheduleType === 'interval' ? interval : undefined,
    })
  }

  return (
    <div className="glass flex flex-col gap-3 rounded-lg border p-4">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="trigger-type" className="text-xs font-medium text-gray-300">
            Trigger Type
          </label>
          <select
            id="trigger-type"
            value={triggerType}
            onChange={(e) => setTriggerType(e.target.value)}
            className="rounded-md bg-white/5 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400/50 [&_option]:bg-gray-800 [&_option]:text-white"
          >
            <option value="manual">Manual</option>
            <option value="scheduled">Scheduled</option>
          </select>
        </div>

        {triggerType === 'manual' && (
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="requires-approval"
              checked={requiresApproval}
              onChange={(e) => setRequiresApproval(e.target.checked)}
              className="size-3"
            />
            <label htmlFor="requires-approval" className="text-xs text-gray-300">
              Requires Approval
            </label>
          </div>
        )}

        {triggerType === 'scheduled' && (
          <>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="schedule-type" className="text-xs font-medium text-gray-300">
                Schedule Type
              </label>
              <select
                id="schedule-type"
                value={scheduleType}
                onChange={(e) => setScheduleType(e.target.value)}
                className="rounded-md bg-white/5 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400/50 [&_option]:bg-gray-800 [&_option]:text-white"
              >
                <option value="interval">Interval</option>
                <option value="continuous">Continuous</option>
              </select>
            </div>

            {scheduleType === 'interval' && (
              <DateRangeCadencePicker value={interval} onChange={setInterval} required showTime />
            )}
          </>
        )}

        <Button type="submit" variant="primary" className="w-full justify-center text-xs">
          {submitButtonText}
        </Button>
      </form>
    </div>
  )
}
