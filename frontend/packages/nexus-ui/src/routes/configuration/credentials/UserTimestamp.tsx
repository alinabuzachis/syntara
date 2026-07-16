import type { CredentialsAPI } from '@ansible/nexus-contracts'
import { Content, ContentVariants } from '@patternfly/react-core'

import { formatDateTime } from '../../../utils/dateUtils'

import styles from './UserTimestamp.module.css'

type UserReference = CredentialsAPI.components['schemas']['UserReference']

type UserTimestampProps = {
  user?: UserReference | string | null
  timestamp?: string
  /** Use subtle color for the timestamp (default: true). Set false for neutral color. */
  subtleTimestamp?: boolean
  /** Render user and date on a single line (default: false). Use true for table columns. */
  inline?: boolean
}

function resolveDisplayName(user: UserReference | string | null | undefined): string | undefined {
  if (!user) return undefined
  if (typeof user === 'string') return user
  return user.name
}

/**
 * Displays a username (brand-colored) with a formatted timestamp.
 * In inline mode (tables): "username · date" on one line.
 * In stacked mode (detail views): username above date on separate lines.
 */
export function UserTimestamp({
  user,
  timestamp,
  subtleTimestamp = true,
  inline = false,
}: Readonly<UserTimestampProps>) {
  const displayName = resolveDisplayName(user)
  const formattedDate = formatDateTime(timestamp)

  if (inline) {
    return (
      <Content component={ContentVariants.p} className={styles.inlineWrapper}>
        {displayName && (
          <>
            <Content component={ContentVariants.a} className={styles.inlineUser}>
              {displayName}
            </Content>
            {' · '}
          </>
        )}
        <Content
          component={ContentVariants.small}
          className={subtleTimestamp ? styles.inlineTimestamp : styles.inlineTimestampDefault}
        >
          {formattedDate}
        </Content>
      </Content>
    )
  }

  return (
    <>
      {displayName && (
        <Content component={ContentVariants.p} className={styles.user}>
          {displayName}
        </Content>
      )}
      <Content
        component={ContentVariants.small}
        className={subtleTimestamp ? styles.timestamp : styles.timestampDefault}
      >
        {formattedDate}
      </Content>
    </>
  )
}
