import { FormGroupLabelHelp, FormHelperText, HelperText, HelperTextItem, Popover } from '@patternfly/react-core'
import { RhUiErrorIcon } from '@patternfly/react-icons'
import { useRef } from 'react'
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

export type FieldHelpPopoverProps = Readonly<{
  helpText: string
}>

/** Label help for FormGroup: PatternFly FormGroupLabelHelp + Popover with shared ref (PF-recommended). */
export function FieldHelpPopover({ helpText }: FieldHelpPopoverProps) {
  const triggerRef = useRef<HTMLSpanElement>(null)
  return (
    <Popover triggerRef={triggerRef} bodyContent={helpText} aria-label="Field help">
      <FormGroupLabelHelp ref={triggerRef} aria-label="More info" />
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
