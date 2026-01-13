import { Content, ContentVariants, Timestamp } from '@patternfly/react-core'

/**
 * Displays a formatted date/time using PatternFly's Timestamp component,
 * or "-" if the date is invalid.
 *
 * Handles:
 * - null/undefined values
 * - Invalid date strings that result in "Invalid Date"
 * - Empty strings
 */
export function DateCell(props: { dateString?: string | null }) {
  if (!props.dateString) {
    return <Content component={ContentVariants.p}>-</Content>
  }

  const date = new Date(props.dateString)
  if (Number.isNaN(date.getTime())) {
    return <Content component={ContentVariants.p}>-</Content>
  }

  return <Timestamp date={date} />
}
