import { FormGroupLabelHelp, Popover } from '@patternfly/react-core'
import { type ReactNode, useRef } from 'react'

export type FieldHelpPopoverProps = Readonly<{
  /** Body content for the popover (plain text or rich React nodes). */
  helpText: ReactNode
  /** Optional header shown at the top of the popover. */
  headerContent?: ReactNode
  /** Accessible name for the popover dialog. Defaults to "Field help". */
  'aria-label'?: string
}>

/**
 * Label help for FormGroup: PatternFly FormGroupLabelHelp + Popover with shared ref (PF-recommended).
 *
 * Pass as `labelHelp` on FormGroup:
 * ```tsx
 * <FormGroup label="Issuer URL" labelHelp={<FieldHelpPopover helpText="…" headerContent="Issuer URL" />}>
 * ```
 */
export function FieldHelpPopover({
  helpText,
  headerContent,
  'aria-label': ariaLabel = 'Field help',
}: FieldHelpPopoverProps) {
  const triggerRef = useRef<HTMLSpanElement>(null)
  const triggerAriaLabel = typeof headerContent === 'string' ? `More info for ${headerContent}` : 'More info'

  return (
    <Popover triggerRef={triggerRef} bodyContent={helpText} headerContent={headerContent} aria-label={ariaLabel}>
      <FormGroupLabelHelp ref={triggerRef} aria-label={triggerAriaLabel} />
    </Popover>
  )
}
