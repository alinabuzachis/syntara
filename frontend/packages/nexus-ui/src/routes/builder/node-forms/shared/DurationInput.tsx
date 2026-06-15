import { FormGroup, Grid, GridItem, TextInput } from '@patternfly/react-core'

import { secondsToTimeUnits, timeUnitsToSeconds } from '../../utils/timeUtils'

type DurationState = {
  days: number
  hours: number
  minutes: number
  seconds: number
}

type DurationInputProps = {
  /** Current value in total seconds. `undefined` means "not set". */
  value: number | undefined
  onChange: (totalSeconds: number | undefined) => void
  /** Prefix used to generate unique field IDs. */
  idPrefix: string
  isDisabled?: boolean
}

function toDurationState(totalSeconds: number | undefined): DurationState {
  if (totalSeconds === undefined) return { days: 0, hours: 0, minutes: 0, seconds: 0 }
  return secondsToTimeUnits(totalSeconds)
}

function toTotalSeconds(state: DurationState): number | undefined {
  const total = timeUnitsToSeconds(state.seconds, state.minutes, state.hours, state.days)
  return total > 0 ? total : undefined
}

export function DurationInput({ value, onChange, idPrefix, isDisabled }: DurationInputProps) {
  const duration = toDurationState(value)
  // When value is undefined (not set), show empty inputs so the placeholder "0" appears.
  // When value is a number, show all components including zero — a saved 5-minute timeout
  // correctly shows seconds as 0, not as an empty field.
  const fieldValue = (n: number) => (value === undefined ? '' : n)

  function handleFieldChange(field: keyof DurationState, raw: string) {
    const parsed = Number.parseInt(raw, 10)
    const next = { ...duration, [field]: Number.isNaN(parsed) || parsed < 0 ? 0 : parsed }
    onChange(toTotalSeconds(next))
  }

  return (
    <Grid hasGutter>
      <GridItem span={3}>
        <FormGroup label="Day(s)" fieldId={`${idPrefix}-days`}>
          <TextInput
            id={`${idPrefix}-days`}
            type="number"
            min={0}
            value={fieldValue(duration.days)}
            placeholder="0"
            isDisabled={isDisabled}
            onChange={(_event, val) => handleFieldChange('days', val)}
          />
        </FormGroup>
      </GridItem>
      <GridItem span={3}>
        <FormGroup label="Hour(s)" fieldId={`${idPrefix}-hours`}>
          <TextInput
            id={`${idPrefix}-hours`}
            type="number"
            min={0}
            value={fieldValue(duration.hours)}
            placeholder="0"
            isDisabled={isDisabled}
            onChange={(_event, val) => handleFieldChange('hours', val)}
          />
        </FormGroup>
      </GridItem>
      <GridItem span={3}>
        <FormGroup label="Minute(s)" fieldId={`${idPrefix}-minutes`}>
          <TextInput
            id={`${idPrefix}-minutes`}
            type="number"
            min={0}
            value={fieldValue(duration.minutes)}
            placeholder="0"
            isDisabled={isDisabled}
            onChange={(_event, val) => handleFieldChange('minutes', val)}
          />
        </FormGroup>
      </GridItem>
      <GridItem span={3}>
        <FormGroup label="Second(s)" fieldId={`${idPrefix}-seconds`}>
          <TextInput
            id={`${idPrefix}-seconds`}
            type="number"
            min={0}
            value={fieldValue(duration.seconds)}
            placeholder="0"
            isDisabled={isDisabled}
            onChange={(_event, val) => handleFieldChange('seconds', val)}
          />
        </FormGroup>
      </GridItem>
    </Grid>
  )
}
