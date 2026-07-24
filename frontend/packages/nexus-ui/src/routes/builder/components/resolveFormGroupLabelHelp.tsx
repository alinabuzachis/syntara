import type { ReactElement, ReactNode } from 'react'

import { FieldHelpPopover } from '../../../components/FieldHelpPopover'

/** Prefer an explicit labelHelp element; otherwise build one from helpText. */
export function resolveFormGroupLabelHelp(
  label: string,
  labelHelp?: ReactElement,
  helpText?: ReactNode
): ReactElement | undefined {
  if (labelHelp) return labelHelp
  if (helpText) return <FieldHelpPopover headerContent={label} helpText={helpText} />
  return undefined
}
