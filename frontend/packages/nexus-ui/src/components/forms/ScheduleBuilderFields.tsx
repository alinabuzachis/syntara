import {
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  MenuToggle,
  type MenuToggleElement,
  NumberInput,
  Select,
  SelectList,
  SelectOption,
  Stack,
  StackItem,
  TextInput,
  TextInputGroup,
  TextInputGroupMain,
  TextInputGroupUtilities,
  Button,
} from '@patternfly/react-core'
import { RhUiCloseIcon, RhUiErrorIcon } from '@patternfly/react-icons'
import { type Dispatch, useCallback, useEffect, useReducer, useRef, useState } from 'react'

import {
  durationToFrequencyAndInterval,
  frequencyAndIntervalToDuration,
  parseRepeatingInterval,
  type ScheduleFrequency,
} from '../../utils/triggerFormatting'
import { FormLabelWithHelp } from '../FormLabelWithHelp'

import styles from './ScheduleBuilderFields.module.css'
import { END_DATE_HELP, FREQUENCY_HELP, INTERVAL_HELP, START_DATE_HELP } from './scheduleHelpText'

export type ScheduleBuilderFieldsProps = Readonly<{
  value?: string
  onChange?: (interval: string) => void
  timezone?: string
  onTimezoneChange?: (tz: string) => void
  required?: boolean
  error?: boolean
  errorMessage?: string
}>

// ── State management ─────────────────────────────────────────────────────

type BuilderState = {
  startDate: string
  startTime: string
  endDate: string
  frequency: ScheduleFrequency
  intervalCount: number
}

type BuilderAction =
  | { type: 'SET_START_DATE'; payload: string }
  | { type: 'SET_START_TIME'; payload: string }
  | { type: 'SET_END_DATE'; payload: string }
  | { type: 'SET_FREQUENCY'; payload: ScheduleFrequency }
  | { type: 'SET_INTERVAL_COUNT'; payload: number }
  | { type: 'INIT'; payload: BuilderState }

function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case 'SET_START_DATE':
      return { ...state, startDate: action.payload }
    case 'SET_START_TIME':
      return { ...state, startTime: action.payload }
    case 'SET_END_DATE':
      return { ...state, endDate: action.payload }
    case 'SET_FREQUENCY':
      return { ...state, frequency: action.payload }
    case 'SET_INTERVAL_COUNT':
      return { ...state, intervalCount: Math.max(1, action.payload) }
    case 'INIT':
      return action.payload
    default:
      return state
  }
}

function toDateOnly(isoString: string): string {
  if (!isoString) return ''
  const tIndex = isoString.indexOf('T')
  if (tIndex === -1) return ''
  const datePart = isoString.substring(0, tIndex)
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : ''
}

function extractTimeHHMM(isoString: string): string {
  if (!isoString) return ''
  const tIndex = isoString.indexOf('T')
  if (tIndex === -1) return ''
  const timePart = isoString.substring(tIndex + 1)
  const match = /^(\d{2}):(\d{2})/.exec(timePart)
  return match ? `${match[1]}:${match[2]}` : ''
}

function buildISOString(dateStr: string, timeStr: string, tzOffset: string): string {
  if (!dateStr) return ''
  return `${dateStr}T${timeStr}${tzOffset}`
}

function getTimezoneOffset(timezone: string, referenceDate?: string): string {
  try {
    const refDate = referenceDate ? new Date(`${referenceDate}T12:00:00`) : new Date()
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'longOffset',
    })
    const parts = formatter.formatToParts(refDate)
    const tzPart = parts.find((p) => p.type === 'timeZoneName')
    if (!tzPart) return 'Z'
    const offset = tzPart.value.replace('GMT', '')
    return offset || '+00:00'
  } catch {
    return 'Z'
  }
}

function parseInitialState(value: string): BuilderState {
  const parsed = parseRepeatingInterval(value)
  const { frequency, count } = durationToFrequencyAndInterval(parsed.cadence)

  return {
    startDate: toDateOnly(parsed.start),
    startTime: extractTimeHHMM(parsed.start),
    endDate: parsed.end ? toDateOnly(parsed.end) : '',
    frequency: parsed.cadence === 'PT0S' ? 'none' : frequency,
    intervalCount: count,
  }
}

function useScheduleBuilder(value: string, timezone: string, onChange?: (interval: string) => void) {
  const [state, dispatch] = useReducer(builderReducer, value, parseInitialState)
  const prevValueRef = useRef(value)
  const lastEmittedRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (value !== prevValueRef.current && value !== lastEmittedRef.current) {
      dispatch({ type: 'INIT', payload: parseInitialState(value) })
    }
    prevValueRef.current = value
  }, [value])

  const { startDate, startTime, endDate, frequency, intervalCount } = state

  useEffect(() => {
    if (!startDate) {
      onChange?.('')
      return
    }

    const tzOffset = getTimezoneOffset(timezone, startDate)
    const start = buildISOString(startDate, `${startTime || '00:00'}:00`, tzOffset)
    if (!start) return

    const duration = frequencyAndIntervalToDuration(frequency, intervalCount)
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
      const endTzOffset = getTimezoneOffset(timezone, endDate)
      interval += `/${buildISOString(endDate, '23:59:59', endTzOffset)}`
    }

    if (interval !== value) {
      lastEmittedRef.current = interval
      onChange?.(interval)
    }
  }, [startDate, startTime, endDate, frequency, intervalCount, timezone, onChange, value])

  return { state, dispatch }
}

// ── Frequency options ────────────────────────────────────────────────────

const frequencyOptions: { value: ScheduleFrequency; label: string }[] = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'minutely', label: 'Minutely' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
]

// ── Timezone list ────────────────────────────────────────────────────────

let cachedTimezones: string[] | null = null

function getTimezones(): string[] {
  if (!cachedTimezones) {
    try {
      cachedTimezones = Intl.supportedValuesOf('timeZone')
    } catch {
      cachedTimezones = ['UTC']
    }
  }
  return cachedTimezones
}

// ── Sub-components (module-scoped per S6478) ─────────────────────────────

type DispatchBuilder = Dispatch<BuilderAction>

function StartDateTimeField({
  startDate,
  startTime,
  timezone,
  dispatch,
  onTimezoneChange,
  required,
  error,
  errorMessage,
}: Readonly<{
  startDate: string
  startTime: string
  timezone: string
  dispatch: DispatchBuilder
  onTimezoneChange?: (tz: string) => void
  required: boolean
  error: boolean
  errorMessage?: string
}>) {
  const [tzOpen, setTzOpen] = useState(false)
  const [tzFilter, setTzFilter] = useState('')

  const timezones = getTimezones()
  const filteredTimezones = tzFilter
    ? timezones.filter((tz) => tz.toLowerCase().includes(tzFilter.toLowerCase()))
    : timezones

  const handleTzSelect = useCallback(
    (_event: React.MouseEvent | undefined, value: string | number | undefined) => {
      if (value === undefined) return
      onTimezoneChange?.(String(value))
      setTzOpen(false)
      setTzFilter('')
    },
    [onTimezoneChange]
  )

  const tzToggle = useCallback(
    (toggleRef: React.Ref<MenuToggleElement>) => (
      <MenuToggle ref={toggleRef} onClick={() => setTzOpen((prev) => !prev)} isExpanded={tzOpen} isFullWidth>
        {timezone || 'UTC'}
      </MenuToggle>
    ),
    [tzOpen, timezone]
  )

  return (
    <StackItem>
      <FormGroup
        label={<FormLabelWithHelp label="Start date and time" helpText={START_DATE_HELP} />}
        fieldId="schedule-start-date"
        isRequired={required}
      >
        <div className={styles.startDateTimeRow}>
          <div className={styles.dateInput}>
            <TextInput
              id="schedule-start-date"
              type="date"
              value={startDate}
              onChange={(_event, val) => dispatch({ type: 'SET_START_DATE', payload: val })}
              aria-label="Start date"
              aria-required={required || undefined}
              aria-invalid={error}
              validated={error ? 'error' : 'default'}
            />
          </div>
          <div className={styles.timeInput}>
            <TextInput
              id="schedule-start-time"
              type="time"
              value={startTime}
              onChange={(_event, val) => dispatch({ type: 'SET_START_TIME', payload: val })}
              aria-label="Start time"
            />
          </div>
          <div className={styles.timezoneSelect}>
            <Select
              id="schedule-timezone"
              isOpen={tzOpen}
              selected={timezone}
              onSelect={handleTzSelect}
              onOpenChange={(open) => {
                setTzOpen(open)
                if (!open) setTzFilter('')
              }}
              toggle={tzToggle}
            >
              <TextInputGroup>
                <TextInputGroupMain
                  value={tzFilter}
                  onChange={(_event, val) => setTzFilter(val)}
                  placeholder="Filter timezones"
                  aria-label="Filter timezones"
                />
                {tzFilter && (
                  <TextInputGroupUtilities>
                    <Button variant="plain" onClick={() => setTzFilter('')} aria-label="Clear timezone filter">
                      <RhUiCloseIcon />
                    </Button>
                  </TextInputGroupUtilities>
                )}
              </TextInputGroup>
              <SelectList aria-label="Timezone options">
                {filteredTimezones.slice(0, 50).map((tz) => (
                  <SelectOption key={tz} value={tz}>
                    {tz}
                  </SelectOption>
                ))}
              </SelectList>
            </Select>
          </div>
        </div>
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

function EndDateField({
  endDate,
  startDate,
  dispatch,
}: Readonly<{ endDate: string; startDate: string; dispatch: DispatchBuilder }>) {
  const endBeforeStart = Boolean(endDate && startDate && endDate < startDate)

  return (
    <StackItem>
      <FormGroup label={<FormLabelWithHelp label="End date" helpText={END_DATE_HELP} />} fieldId="schedule-end-date">
        <TextInput
          id="schedule-end-date"
          type="date"
          value={endDate}
          min={startDate || undefined}
          onChange={(_event, val) => dispatch({ type: 'SET_END_DATE', payload: val })}
          aria-label="End date"
          validated={endBeforeStart ? 'error' : 'default'}
          aria-invalid={endBeforeStart || undefined}
        />
        <FormHelperText>
          <HelperText>
            <HelperTextItem
              variant={endBeforeStart ? 'error' : 'default'}
              icon={endBeforeStart ? <RhUiErrorIcon /> : undefined}
            >
              {endBeforeStart
                ? 'End date must be on or after the start date.'
                : 'If this field is left empty, the schedule will not have an end date.'}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>
    </StackItem>
  )
}

function FrequencySelectField({
  frequency,
  dispatch,
  required,
}: Readonly<{
  frequency: ScheduleFrequency
  dispatch: DispatchBuilder
  required: boolean
}>) {
  const [isOpen, setIsOpen] = useState(false)
  const selectedLabel = frequencyOptions.find((o) => o.value === frequency)?.label ?? 'Does not repeat'

  const handleSelect = useCallback(
    (_event: React.MouseEvent | undefined, value: string | number | undefined) => {
      if (value === undefined) return
      dispatch({ type: 'SET_FREQUENCY', payload: value as ScheduleFrequency })
      setIsOpen(false)
    },
    [dispatch]
  )

  const renderToggle = useCallback(
    (toggleRef: React.Ref<MenuToggleElement>) => (
      <MenuToggle
        ref={toggleRef}
        onClick={() => setIsOpen((prev) => !prev)}
        isExpanded={isOpen}
        isFullWidth
        aria-label="Frequency"
        aria-required={required || undefined}
      >
        {selectedLabel}
      </MenuToggle>
    ),
    [isOpen, selectedLabel, required]
  )

  return (
    <StackItem>
      <FormGroup
        label={<FormLabelWithHelp label="Frequency" helpText={FREQUENCY_HELP} />}
        fieldId="schedule-frequency"
        isRequired={required}
      >
        <Select
          id="schedule-frequency"
          isOpen={isOpen}
          selected={frequency}
          onSelect={handleSelect}
          onOpenChange={setIsOpen}
          shouldFocusToggleOnSelect
          toggle={renderToggle}
        >
          <SelectList aria-label="Frequency options">
            {frequencyOptions.map((option) => (
              <SelectOption key={option.value} value={option.value}>
                {option.label}
              </SelectOption>
            ))}
          </SelectList>
        </Select>
      </FormGroup>
    </StackItem>
  )
}

function IntervalCountField({
  intervalCount,
  dispatch,
  required,
}: Readonly<{
  intervalCount: number
  dispatch: DispatchBuilder
  required: boolean
}>) {
  return (
    <StackItem>
      <FormGroup
        label={<FormLabelWithHelp label="Interval" helpText={INTERVAL_HELP} />}
        fieldId="schedule-interval"
        isRequired={required}
      >
        <div className={styles.intervalInput}>
          <NumberInput
            id="schedule-interval"
            value={intervalCount}
            min={1}
            onMinus={() => dispatch({ type: 'SET_INTERVAL_COUNT', payload: intervalCount - 1 })}
            onPlus={() => dispatch({ type: 'SET_INTERVAL_COUNT', payload: intervalCount + 1 })}
            onChange={(event) => {
              const val = Number((event.target as HTMLInputElement).value)
              if (!Number.isNaN(val)) dispatch({ type: 'SET_INTERVAL_COUNT', payload: val })
            }}
            aria-label="Interval"
            inputAriaLabel="Interval count"
          />
        </div>
      </FormGroup>
    </StackItem>
  )
}

// ── Main component ───────────────────────────────────────────────────────

export function ScheduleBuilderFields({
  value = '',
  onChange,
  timezone = 'UTC',
  onTimezoneChange,
  required = false,
  error = false,
  errorMessage,
}: ScheduleBuilderFieldsProps) {
  const { state, dispatch } = useScheduleBuilder(value, timezone, onChange)
  const { startDate, startTime, endDate, frequency, intervalCount } = state

  return (
    <Stack hasGutter data-testid="schedule-builder-fields">
      <StartDateTimeField
        startDate={startDate}
        startTime={startTime}
        timezone={timezone}
        dispatch={dispatch}
        onTimezoneChange={onTimezoneChange}
        required={required}
        error={error}
        errorMessage={errorMessage}
      />
      <EndDateField endDate={endDate} startDate={startDate} dispatch={dispatch} />
      <FrequencySelectField frequency={frequency} dispatch={dispatch} required={required} />
      {frequency !== 'none' && (
        <IntervalCountField intervalCount={intervalCount} dispatch={dispatch} required={required} />
      )}
    </Stack>
  )
}
