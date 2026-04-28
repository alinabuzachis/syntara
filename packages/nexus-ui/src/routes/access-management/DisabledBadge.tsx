import { Label } from '@patternfly/react-core'

/** Inline "Disabled" label shown next to disabled user accounts. */
export function DisabledBadge() {
  return (
    <Label variant="outline" isCompact style={{ marginInlineStart: 'var(--pf-t--global--spacer--sm)' }}>
      Disabled
    </Label>
  )
}
