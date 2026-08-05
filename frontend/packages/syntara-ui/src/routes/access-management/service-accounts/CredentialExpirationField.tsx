import { DatePicker, FormGroup, FormHelperText, HelperText, HelperTextItem } from '@patternfly/react-core'
import type { ReactElement } from 'react'

import { formatDateYMD, parseDateYMD } from '../../../utils/dateUtils'

export function CredentialExpirationField({
  selectedDate,
  onDateChange,
  dateError,
  validator,
  helperText,
  label = 'Expiration date',
  fieldId = 'credential-expires-at',
  labelHelp,
}: Readonly<{
  selectedDate: string
  onDateChange: (event: React.FormEvent<HTMLInputElement>, value: string, dateValue?: Date) => void
  dateError: string
  validator: (date: Date) => string
  helperText: string
  label?: string
  fieldId?: string
  labelHelp?: ReactElement
}>) {
  return (
    <FormGroup label={label} fieldId={fieldId} isRequired labelHelp={labelHelp}>
      <DatePicker
        value={selectedDate}
        onChange={onDateChange}
        dateFormat={formatDateYMD}
        dateParse={parseDateYMD}
        validators={[validator]}
        aria-label={label}
        inputProps={{
          id: fieldId,
          validated: dateError ? 'error' : 'default',
        }}
        appendTo={() => document.body}
      />
      <FormHelperText>
        <HelperText>
          <HelperTextItem variant={dateError ? 'error' : 'default'}>{dateError || helperText}</HelperTextItem>
        </HelperText>
      </FormHelperText>
    </FormGroup>
  )
}
