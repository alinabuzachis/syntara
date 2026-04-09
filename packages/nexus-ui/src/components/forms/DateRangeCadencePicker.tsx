import {
  Flex,
  FlexItem,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Stack,
  StackItem,
  TextInput,
} from '@patternfly/react-core'
import { RhUiErrorIcon } from '@patternfly/react-icons'
import { type Dispatch, useEffect, useReducer, useRef } from 'react'

import { parseRepeatingInterval as parseRepeatingIntervalUtil } from '../../utils/triggerFormatting'

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
  /** Message to show under Start date when error is true (e.g. "Start date is required") */
  errorMessage?: string
}

type CadenceValue = 'none' | 'daily' | 'weekly' | 'monthly' | 'annually'

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

// Use shared parseRepeatingInterval utility
const parseRepeatingInterval = parseRepeatingIntervalUtil

/**
 * Format a date string to date input format (YYYY-MM-DD)
 */
function toDateOnly(isoString: string): string {
  if (!isoString) return ''

  try {
    const date = new Date(isoString)
    if (Number.isNaN(date.getTime())) return ''

    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')

    return `${year}-${month}-${day}`
  } catch {
    return ''
  }
}

/**
 * Extract time from ISO string (UTC) so round-trip matches: we store in UTC, so we read back in UTC.
 */
function extractTime(isoString: string): { hour: number; minute: number; period: 'AM' | 'PM' } {
  if (!isoString) return { hour: 12, minute: 0, period: 'AM' }

  try {
    const date = new Date(isoString)
    if (Number.isNaN(date.getTime())) return { hour: 12, minute: 0, period: 'AM' }

    const hours24 = date.getUTCHours()
    const minutes = date.getUTCMinutes()

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
    if (Number.isNaN(date.getTime())) return ''

    return date.toISOString()
  } catch {
    return ''
  }
}

const cadenceOptions: { value: CadenceValue; label: string }[] = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'annually', label: 'Annually' },
]

interface DateRangeCadenceState {
  startDate: string
  cadence: CadenceValue
  triggerHour: number
  triggerMinute: number
  triggerPeriod: 'AM' | 'PM'
  endDate: string
}

type DateRangeCadenceAction =
  | { type: 'SET_START_DATE'; payload: string }
  | { type: 'SET_CADENCE'; payload: CadenceValue }
  | { type: 'SET_TRIGGER_HOUR'; payload: number }
  | { type: 'SET_TRIGGER_MINUTE'; payload: number }
  | { type: 'SET_TRIGGER_PERIOD'; payload: 'AM' | 'PM' }
  | { type: 'SET_END_DATE'; payload: string }
  | {
      type: 'INIT_FROM_VALUE'
      payload: {
        startDate: string
        cadence: CadenceValue
        hour: number
        minute: number
        period: 'AM' | 'PM'
        endDate: string
      }
    }

function dateRangeCadenceReducer(state: DateRangeCadenceState, action: DateRangeCadenceAction): DateRangeCadenceState {
  switch (action.type) {
    case 'SET_START_DATE':
      return { ...state, startDate: action.payload }
    case 'SET_CADENCE':
      return { ...state, cadence: action.payload }
    case 'SET_TRIGGER_HOUR':
      return { ...state, triggerHour: action.payload }
    case 'SET_TRIGGER_MINUTE':
      return { ...state, triggerMinute: action.payload }
    case 'SET_TRIGGER_PERIOD':
      return { ...state, triggerPeriod: action.payload }
    case 'SET_END_DATE':
      return { ...state, endDate: action.payload }
    case 'INIT_FROM_VALUE':
      return {
        startDate: action.payload.startDate,
        cadence: action.payload.cadence,
        triggerHour: action.payload.hour,
        triggerMinute: action.payload.minute,
        triggerPeriod: action.payload.period,
        endDate: action.payload.endDate,
      }
    default:
      return state
  }
}

function useDateRangeCadence(value: string, onChange?: (interval: string) => void) {
  const parsed = parseRepeatingInterval(value)
  const time = extractTime(parsed.start)

  const [state, dispatch] = useReducer(dateRangeCadenceReducer, {
    startDate: toDateOnly(parsed.start),
    cadence: durationToCadence(parsed.cadence),
    triggerHour: time.hour,
    triggerMinute: time.minute,
    triggerPeriod: time.period,
    endDate: parsed.end ? toDateOnly(parsed.end) : '',
  })
  const { startDate, cadence, triggerHour, triggerMinute, triggerPeriod, endDate } = state

  const prevValueRef = useRef(value)
  const lastEmittedRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (value !== prevValueRef.current && value !== lastEmittedRef.current) {
      const nextParsed = parseRepeatingInterval(value)
      const nextTime = extractTime(nextParsed.start)
      dispatch({
        type: 'INIT_FROM_VALUE',
        payload: {
          startDate: toDateOnly(nextParsed.start),
          cadence: durationToCadence(nextParsed.cadence),
          hour: nextTime.hour,
          minute: nextTime.minute,
          period: nextTime.period,
          endDate: nextParsed.end ? toDateOnly(nextParsed.end) : '',
        },
      })
    }
    prevValueRef.current = value
  }, [value])

  useEffect(() => {
    const duration = cadenceToDuration(cadence)
    const start = toISOString(startDate, triggerHour, triggerMinute, triggerPeriod)

    if (!startDate || !start) {
      onChange?.('')
      return
    }

    if (!duration) {
      const runOnce = `R1/${start}/PT0S`
      if (runOnce !== value) {
        lastEmittedRef.current = runOnce
        onChange?.(runOnce)
      }
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
      lastEmittedRef.current = interval
      onChange?.(interval)
    }
  }, [startDate, cadence, triggerHour, triggerMinute, triggerPeriod, endDate, onChange, value])

  return { state, dispatch }
}

type DispatchDateRangeCadence = Dispatch<DateRangeCadenceAction>

function StartDateField({
  startDate,
  dispatch,
  required,
  error,
  errorMessage,
}: {
  startDate: string
  dispatch: DispatchDateRangeCadence
  required: boolean
  error: boolean
  errorMessage?: string
}) {
  return (
    <StackItem>
      <FormGroup label="Start date" fieldId="cadence-start" isRequired={required}>
        <TextInput
          id="cadence-start"
          type="date"
          value={startDate}
          onChange={(_event, value) => dispatch({ type: 'SET_START_DATE', payload: value })}
          aria-label="Start date"
          aria-invalid={error}
          validated={error ? 'error' : 'default'}
        />
        {error && errorMessage && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                {errorMessage}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>
    </StackItem>
  )
}

function CadenceSelectField({
  cadence,
  dispatch,
  required,
}: {
  cadence: CadenceValue
  dispatch: DispatchDateRangeCadence
  required: boolean
}) {
  return (
    <StackItem>
      <FormGroup label="Cadence" fieldId="cadence-select" isRequired={required}>
        <FormSelect
          id="cadence-select"
          value={cadence}
          onChange={(_event, value) => dispatch({ type: 'SET_CADENCE', payload: value as CadenceValue })}
          aria-label="Cadence"
        >
          {cadenceOptions.map((option) => (
            <FormSelectOption key={option.value} value={option.value} label={option.label} />
          ))}
        </FormSelect>
      </FormGroup>
    </StackItem>
  )
}

function TriggerTimeField({
  triggerHour,
  triggerMinute,
  triggerPeriod,
  dispatch,
  required,
}: {
  triggerHour: number
  triggerMinute: number
  triggerPeriod: 'AM' | 'PM'
  dispatch: DispatchDateRangeCadence
  required: boolean
}) {
  return (
    <StackItem>
      <FormGroup label="Trigger time" fieldId="trigger-time" isRequired={required}>
        <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapXs' }}>
          <FlexItem>
            <TextInput
              type="number"
              value={String(triggerHour)}
              onChange={(_event, value) => {
                const val = Number.parseInt(value) || 1
                dispatch({ type: 'SET_TRIGGER_HOUR', payload: Math.max(1, Math.min(12, val)) })
              }}
              min={1}
              max={12}
              style={{ width: '5ch', textAlign: 'center' }}
              aria-label="Hour"
            />
          </FlexItem>
          <FlexItem>
            <span style={{ color: 'var(--pf-t--global--color--text--secondary)' }}>:</span>
          </FlexItem>
          <FlexItem>
            <TextInput
              type="number"
              value={String(triggerMinute).padStart(2, '0')}
              onChange={(_event, value) => {
                const val = Number.parseInt(value) || 0
                dispatch({ type: 'SET_TRIGGER_MINUTE', payload: Math.max(0, Math.min(59, val)) })
              }}
              min={0}
              max={59}
              style={{ width: '5ch', textAlign: 'center' }}
              aria-label="Minute"
            />
          </FlexItem>
          <FlexItem>
            <FormSelect
              value={triggerPeriod}
              onChange={(_event, value) => dispatch({ type: 'SET_TRIGGER_PERIOD', payload: value as 'AM' | 'PM' })}
              aria-label="Period"
              style={{ width: '6ch' }}
            >
              <FormSelectOption value="AM" label="AM" />
              <FormSelectOption value="PM" label="PM" />
            </FormSelect>
          </FlexItem>
        </Flex>
      </FormGroup>
    </StackItem>
  )
}

function EndDateField({ endDate, dispatch }: { endDate: string; dispatch: DispatchDateRangeCadence }) {
  return (
    <StackItem>
      <FormGroup label="End date" fieldId="cadence-end">
        <TextInput
          id="cadence-end"
          type="date"
          value={endDate}
          onChange={(_event, value) => dispatch({ type: 'SET_END_DATE', payload: value })}
          placeholder="Never ends"
          aria-label="End date"
        />
        <FormHelperText>If this field is left empty, the schedule will not have an end date.</FormHelperText>
      </FormGroup>
    </StackItem>
  )
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
  const { value = '', onChange, showTime = true, required = false, className = '', error = false, errorMessage } = props
  const { state, dispatch } = useDateRangeCadence(value, onChange)
  const { startDate, cadence, triggerHour, triggerMinute, triggerPeriod, endDate } = state

  return (
    <Stack hasGutter className={className}>
      <StartDateField
        startDate={startDate}
        dispatch={dispatch}
        required={required}
        error={error}
        errorMessage={errorMessage}
      />
      <CadenceSelectField cadence={cadence} dispatch={dispatch} required={required} />
      {showTime && (
        <TriggerTimeField
          triggerHour={triggerHour}
          triggerMinute={triggerMinute}
          triggerPeriod={triggerPeriod}
          dispatch={dispatch}
          required={required}
        />
      )}
      <EndDateField endDate={endDate} dispatch={dispatch} />
    </Stack>
  )
}
