import { Content, ContentVariants } from '@patternfly/react-core'

/**
 * Formats a date string or returns null if invalid.
 * Returns null for: null, undefined, empty string, or invalid date.
 */
function formatDate(dateString: string | null | undefined): { date: string; time: string } | null {
  if (!dateString) return null

  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return null

  return {
    date: date.toLocaleDateString(),
    time: date.toLocaleTimeString(),
  }
}

/**
 * Displays a formatted date/time or "Unknown" if the date is invalid.
 *
 * Handles:
 * - null/undefined values
 * - Invalid date strings that result in "Invalid Date"
 * - Empty strings
 */
export function DateCell(props: { dateString?: string | null }) {
  const formatted = formatDate(props.dateString)

  if (!formatted) {
    return <Content component={ContentVariants.p}>Unknown</Content>
  }

  return (
    <Content component={ContentVariants.p} style={{ whiteSpace: 'nowrap' }}>
      {formatted.date} <span style={{ opacity: 0.6 }}>{formatted.time}</span>
    </Content>
  )
}
