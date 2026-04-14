import { Content, ContentVariants } from '@patternfly/react-core'

import { formatDateTime } from '../utils/dateUtils'

const userStyle = { margin: 0, color: 'var(--pf-t--global--color--brand--default)' } as const
const timestampStyle = { margin: 0, color: 'var(--pf-t--global--text--color--subtle)' } as const
const timestampDefaultStyle = { margin: 0 } as const

interface UserTimestampProps {
  user?: string | null
  timestamp?: string
  /** Use subtle color for the timestamp (default: true). Set false for neutral color. */
  subtleTimestamp?: boolean
}

/**
 * Displays a username (brand-colored) above a formatted timestamp (small, subtle).
 * Used in credential tables and detail views for Created/Last Modified columns.
 */
export function UserTimestamp({ user, timestamp, subtleTimestamp = true }: Readonly<UserTimestampProps>) {
  return (
    <>
      {user && (
        <Content component={ContentVariants.p} style={userStyle}>
          {user}
        </Content>
      )}
      <Content component={ContentVariants.small} style={subtleTimestamp ? timestampStyle : timestampDefaultStyle}>
        {formatDateTime(timestamp)}
      </Content>
    </>
  )
}
