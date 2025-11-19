/* eslint-disable jsx-a11y/label-has-associated-control */
import { Button } from '@ansible/nexus-ui-framework'
import { useState } from 'react'

interface TriggerNodeFormProps {
  onSubmit: (data: {
    name: string
    triggerType: string
    requiresApproval?: boolean
    scheduleType?: string
    cron?: string
    timezone?: string
    interval?: string
    eventSource?: string
    eventType?: string
  }) => void
  onCancel: () => void
}

export function TriggerNodeForm(props: TriggerNodeFormProps) {
  const [name, setName] = useState('')
  const [triggerType, setTriggerType] = useState('manual')
  const [requiresApproval, setRequiresApproval] = useState(false)
  const [scheduleType, setScheduleType] = useState('cron')
  const [cron, setCron] = useState('0 0 * * *')
  const [timezone, setTimezone] = useState('UTC')
  const [interval, setInterval] = useState('PT1H')
  const [eventSource, setEventSource] = useState('')
  const [eventType, setEventType] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    props.onSubmit({
      name,
      triggerType,
      requiresApproval: triggerType === 'manual' ? requiresApproval : undefined,
      scheduleType: triggerType === 'scheduled' ? scheduleType : undefined,
      cron: triggerType === 'scheduled' && scheduleType === 'cron' ? cron : undefined,
      timezone: triggerType === 'scheduled' && scheduleType === 'cron' ? timezone : undefined,
      interval: triggerType === 'scheduled' && scheduleType === 'interval' ? interval : undefined,
      eventSource: triggerType === 'event' ? eventSource : undefined,
      eventType: triggerType === 'event' ? eventType : undefined,
    })
  }

  return (
    <div className="glass flex flex-col gap-3 rounded-lg border p-4">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-300">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md bg-white/5 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400/50"
            placeholder="Enter trigger name"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-300">Trigger Type</label>
          <select
            value={triggerType}
            onChange={(e) => setTriggerType(e.target.value)}
            className="rounded-md bg-white/5 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400/50 [&_option]:bg-gray-800 [&_option]:text-white"
          >
            <option value="manual">Manual</option>
            <option value="scheduled">Scheduled</option>
            <option value="event">Event</option>
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
              <label className="text-xs font-medium text-gray-300">Schedule Type</label>
              <select
                value={scheduleType}
                onChange={(e) => setScheduleType(e.target.value)}
                className="rounded-md bg-white/5 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400/50 [&_option]:bg-gray-800 [&_option]:text-white"
              >
                <option value="cron">Cron</option>
                <option value="interval">Interval</option>
                <option value="continuous">Continuous</option>
              </select>
            </div>

            {scheduleType === 'cron' && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-gray-300">
                    Cron Expression <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={cron}
                    onChange={(e) => setCron(e.target.value)}
                    className="rounded-md bg-white/5 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400/50"
                    placeholder="0 0 * * *"
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-gray-300">Timezone</label>
                  <input
                    type="text"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="rounded-md bg-white/5 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400/50"
                    placeholder="UTC"
                  />
                </div>
              </>
            )}

            {scheduleType === 'interval' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-gray-300">
                  Interval (ISO 8601) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={interval}
                  onChange={(e) => setInterval(e.target.value)}
                  className="rounded-md bg-white/5 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400/50"
                  placeholder="PT1H"
                  required
                />
              </div>
            )}
          </>
        )}

        {triggerType === 'event' && (
          <>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-300">
                Event Source <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={eventSource}
                onChange={(e) => setEventSource(e.target.value)}
                className="rounded-md bg-white/5 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400/50"
                placeholder="webhook"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-300">
                Event Type <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                className="rounded-md bg-white/5 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400/50"
                placeholder="order.created"
                required
              />
            </div>
          </>
        )}

        <Button type="submit" variant="primary" className="w-full justify-center text-xs">
          Add node
        </Button>
      </form>
    </div>
  )
}
