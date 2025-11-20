import { useEffect, useRef, useState } from 'react'

import { Input } from '../inputs/Input'

import { Cadence, type CadenceValue } from './Cadence'
import { Field } from './Field'
import { NativeSelect } from './NativeSelect'

export interface DateRangeCadencePickerProps {
  /** The current ISO 8601 repeating interval string (e.g., "R/2024-01-01T10:00:00Z/P1D" or "R/2024-01-01T10:00:00Z/P1D/2024-12-31T23:59:59Z") */
  value?: string
  /** Callback when the interval changes, receives the ISO 8601 repeating interval string */
  onChange?: (interval: string) => void
  /** Whether to show time inputs (default: true) */
  showTime?: boolean
  /** Optional label to display above the component */
  label?: string
  /** Whether the field is required (shows asterisk) */
  required?: boolean
  /** Additional CSS classes */
  className?: string
  /** Whether the field has an error state */
  error?: boolean
}

interface ParsedRepeatingInterval {
  start: string
  cadence: string
  end?: string
}

/**
 * Convert CadenceValue to ISO 8601 duration string
 */
function cadenceToDuration(cadence: CadenceValue): string {
  switch (cadence) {
    case 'daily':
      return 'P1D'
    case 'weekly':
      return 'P7D'
    case 'monthly':
      return 'P1M'
    case 'annually':
      return 'P1Y'
    case 'none':
    default:
      return ''
  }
}

/**
 * Convert ISO 8601 duration string to CadenceValue
 */
function durationToCadence(duration: string): CadenceValue {
  if (!duration) return 'none'

  // Normalize the duration string
  const normalized = duration.toUpperCase().trim()

  switch (normalized) {
    case 'P1D':
      return 'daily'
    case 'P7D':
    case 'P1W':
      return 'weekly'
    case 'P1M':
      return 'monthly'
    case 'P1Y':
      return 'annually'
    default:
      return 'none'
  }
}

/**
 * Parse an ISO 8601 repeating interval string into components
 * Supports formats like: "R/2024-01-01T10:00:00Z/P1D" or "R/2024-01-01T10:00:00Z/P1D/2024-12-31T23:59:59Z"
 */
function parseRepeatingInterval(interval: string): ParsedRepeatingInterval {
  if (!interval || !interval.startsWith('R/')) {
    return { start: '', cadence: '' }
  }

  // Remove 'R/' prefix
  const withoutPrefix = interval.substring(2)
  const parts = withoutPrefix.split('/')

  if (parts.length === 2) {
    // Format: R/start/duration
    return { start: parts[0], cadence: parts[1] }
  } else if (parts.length === 3) {
    // Format: R/start/duration/end
    return { start: parts[0], cadence: parts[1], end: parts[2] }
  }

  return { start: '', cadence: '' }
}

/**
 * Format a date string to date input format (YYYY-MM-DD)
 */
function toDateOnly(isoString: string): string {
  if (!isoString) return ''

  try {
    const date = new Date(isoString)
    if (isNaN(date.getTime())) return ''

    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')

    return `${year}-${month}-${day}`
  } catch {
    return ''
  }
}

/**
 * Extract time from ISO string
 */
function extractTime(isoString: string): { hour: number; minute: number; period: 'AM' | 'PM' } {
  if (!isoString) return { hour: 12, minute: 0, period: 'AM' }

  try {
    const date = new Date(isoString)
    if (isNaN(date.getTime())) return { hour: 12, minute: 0, period: 'AM' }

    const hours24 = date.getHours()
    const minutes = date.getMinutes()

    // Convert to 12-hour format
    let hour = hours24 % 12
    if (hour === 0) hour = 12
    const period: 'AM' | 'PM' = hours24 >= 12 ? 'PM' : 'AM'

    return { hour, minute: minutes, period }
  } catch {
    return { hour: 12, minute: 0, period: 'AM' }
  }
}

/**
 * Convert date and time components to ISO 8601 string
 */
function toISOString(dateValue: string, hour: number, minute: number, period: 'AM' | 'PM'): string {
  if (!dateValue) return ''

  try {
    // Convert 12-hour to 24-hour format
    let hours24 = hour
    if (period === 'PM' && hour !== 12) {
      hours24 = hour + 12
    } else if (period === 'AM' && hour === 12) {
      hours24 = 0
    }

    // Parse the date string (YYYY-MM-DD)
    const [year, month, day] = dateValue.split('-').map(Number)
    if (!year || !month || !day) return ''

    const date = new Date(Date.UTC(year, month - 1, day, hours24, minute, 0, 0))
    if (isNaN(date.getTime())) return ''

    return date.toISOString()
  } catch {
    return ''
  }
}

/**
 * Date Range Cadence Picker Component
 *
 * Provides inputs for creating a repeating schedule with start date, trigger time, cadence, and optional end date.
 * Outputs an ISO 8601 repeating interval string.
 *
 * @example
 * ```tsx
 * <DateRangeCadencePicker
 *   value="R/2024-01-01T10:00:00Z/P1D/2024-12-31T23:59:59Z"
 *   onChange={(interval) => console.log(interval)}
 *   showTime
 * />
 * ```
 */
export function DateRangeCadencePicker(props: DateRangeCadencePickerProps) {
  const { value = '', onChange, showTime = true, label, required = false, className = '', error = false } = props

  const parsed = parseRepeatingInterval(value)
  const time = extractTime(parsed.start)

  const [startDate, setStartDate] = useState(toDateOnly(parsed.start))
  const [cadence, setCadence] = useState<CadenceValue>(durationToCadence(parsed.cadence))
  const [triggerHour, setTriggerHour] = useState(time.hour)
  const [triggerMinute, setTriggerMinute] = useState(time.minute)
  const [triggerPeriod, setTriggerPeriod] = useState<'AM' | 'PM'>(time.period)
  const [endDate, setEndDate] = useState(parsed.end ? toDateOnly(parsed.end) : '')

  // Track previous value to detect external changes
  const prevValueRef = useRef(value)
  const isInternalChangeRef = useRef(false)

  // Update local state when value prop changes
  useEffect(() => {
    if (!isInternalChangeRef.current && value !== prevValueRef.current) {
      const parsed = parseRepeatingInterval(value)
      const time = extractTime(parsed.start)

      // eslint-disable-next-line react-hooks/set-state-in-effect -- Controlled component pattern requires syncing external value changes
      setStartDate(toDateOnly(parsed.start))
      setCadence(durationToCadence(parsed.cadence))
      setTriggerHour(time.hour)
      setTriggerMinute(time.minute)
      setTriggerPeriod(time.period)
      setEndDate(parsed.end ? toDateOnly(parsed.end) : '')
    }
    prevValueRef.current = value
    isInternalChangeRef.current = false
  }, [value])

  // Emit the ISO 8601 repeating interval string when values change
  useEffect(() => {
    const duration = cadenceToDuration(cadence)

    // If cadence is 'none', emit empty string
    if (!duration || !startDate) {
      onChange?.('')
      return
    }

    const start = toISOString(startDate, triggerHour, triggerMinute, triggerPeriod)

    if (!start) {
      onChange?.('')
      return
    }

    let interval = `R/${start}/${duration}`

    if (endDate) {
      const end = toISOString(endDate, triggerHour, triggerMinute, triggerPeriod)
      if (end) {
        interval += `/${end}`
      }
    }

    if (interval !== value) {
      isInternalChangeRef.current = true
      onChange?.(interval)
    }
  }, [startDate, cadence, triggerHour, triggerMinute, triggerPeriod, endDate, onChange, value])

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {label && (
        <div className="text-xs font-medium text-gray-300">
          {label} {required && <span className="text-red-500">*</span>}
        </div>
      )}

      {/* Start Date */}
      <Field label="Start Date" htmlFor="cadence-start" required>
        <Input id="cadence-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </Field>

      {/* Cadence */}
      <Cadence value={cadence} onChange={setCadence} label="Cadence" required error={error} />

      {/* Trigger Time */}
      {showTime && (
        <Field label="Trigger Time" required>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={triggerHour}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 1
                setTriggerHour(Math.max(1, Math.min(12, val)))
              }}
              min={1}
              max={12}
              className="w-14 text-center"
              aria-label="Hour"
            />
            <span className="text-xs text-gray-400">:</span>
            <Input
              type="number"
              value={String(triggerMinute).padStart(2, '0')}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 0
                setTriggerMinute(Math.max(0, Math.min(59, val)))
              }}
              min={0}
              max={59}
              className="w-14 text-center"
              aria-label="Minute"
            />
            <NativeSelect
              value={triggerPeriod}
              onChange={(e) => setTriggerPeriod(e.target.value as 'AM' | 'PM')}
              error={error}
              aria-label="Period"
              className="w-20"
            >
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </NativeSelect>
          </div>
        </Field>
      )}

      {/* End Date (Optional) */}
      <Field label="End Date" htmlFor="cadence-end">
        <Input
          id="cadence-end"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          placeholder="Never ends"
        />
      </Field>
    </div>
  )
}
