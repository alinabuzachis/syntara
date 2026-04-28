import { Button, FormHelperText, HelperText, HelperTextItem, Popover } from '@patternfly/react-core'
import { OutlinedQuestionCircleIcon, RhUiErrorIcon } from '@patternfly/react-icons'
import type { FieldError } from 'react-hook-form'

export function FieldErrorMessage({ error }: Readonly<{ error?: FieldError }>) {
  if (!error) return null
  return (
    <FormHelperText>
      <HelperText>
        <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
          {error.message}
        </HelperTextItem>
      </HelperText>
    </FormHelperText>
  )
}

export function FieldHelpIcon(helpText: string) {
  return (
    <Popover bodyContent={helpText}>
      <Button variant="plain" aria-label="More info" onClick={(e) => e.preventDefault()}>
        <OutlinedQuestionCircleIcon />
      </Button>
    </Popover>
  )
}

export function HintOrError({ error, hint }: Readonly<{ error?: FieldError; hint: string }>) {
  return (
    <FormHelperText>
      <HelperText>
        <HelperTextItem variant={error ? 'error' : 'default'} icon={error ? <RhUiErrorIcon /> : undefined}>
          {error?.message ?? hint}
        </HelperTextItem>
      </HelperText>
    </FormHelperText>
  )
}
