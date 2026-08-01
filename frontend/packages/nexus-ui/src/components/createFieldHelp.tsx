import type { ReactElement } from 'react'

import { FieldHelpPopover } from './FieldHelpPopover'

/**
 * Shorthand for FormGroup `labelHelp` popovers.
 * Prefer calling at module scope when building domain registries (e.g. `userHelp`) so FormGroup
 * JSX only references identifiers — avoids V8/Sonar phantom branch noise on inline
 * `labelHelp={<FieldHelpPopover … />}`.
 */
export function createFieldHelp(header: string, helpText: string): ReactElement {
  return <FieldHelpPopover headerContent={header} helpText={helpText} />
}
