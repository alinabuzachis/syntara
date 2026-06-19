import { Content, ContentVariants } from '@patternfly/react-core'

import { formatDateTime } from '../../utils/dateUtils'

/**
 * Displays a formatted date/time (e.g. "Jan 15, 2026, 2:30 PM"),
 * or "-" if the date is invalid.
 */
export function DateCell(props: Readonly<{ dateString?: string | null }>) {
  return <Content component={ContentVariants.p}>{formatDateTime(props.dateString)}</Content>
}
