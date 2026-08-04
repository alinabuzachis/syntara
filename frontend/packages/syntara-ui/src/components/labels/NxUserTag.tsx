import { type LabelProps } from '@patternfly/react-core'

import { NxLabel } from './NxLabel'

type NxUserTagProps = Omit<LabelProps, 'variant'>

/**
 * Outline label for user-authored content — workflow tags, user-entered values.
 *
 * For system-generated labels (statuses, categories, metadata), use `NxLabel` instead.
 */
export function NxUserTag(props: Readonly<NxUserTagProps>) {
  return <NxLabel variant="outline" {...props} />
}
