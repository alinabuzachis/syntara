import { Content, ContentVariants } from '@patternfly/react-core'
import type { CredentialsAPI } from '@syntara/contracts'

import { NxLink } from '../../../components/NxLink'
import { formatDateTime } from '../../../utils/dateUtils'
import { getUserDetailPath } from '../../access-management/accessManagementPaths'

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

function resolveUserId(user: UserReference | string | null | undefined): string | undefined {
  if (!user || typeof user === 'string') return undefined
  return user.id
}

/**
 * Displays a username with a formatted timestamp.
 * When the user is a UserReference (has an id), the username renders as a link
 * to the user detail page. Plain strings render as brand-colored text.
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
  const userId = resolveUserId(user)
  const formattedDate = formatDateTime(timestamp)

  if (inline) {
    return (
      <Content component={ContentVariants.p} className={styles.inlineWrapper}>
        {displayName && (
          <>
            {userId ? (
              <NxLink to={getUserDetailPath(userId)}>{displayName}</NxLink>
            ) : (
              <span className={styles.inlineUser}>{displayName}</span>
            )}
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
      {displayName &&
        (userId ? (
          <NxLink to={getUserDetailPath(userId)}>{displayName}</NxLink>
        ) : (
          <Content component={ContentVariants.p} className={styles.user}>
            {displayName}
          </Content>
        ))}
      <Content
        component={ContentVariants.small}
        className={subtleTimestamp ? styles.timestamp : styles.timestampDefault}
      >
        {formattedDate}
      </Content>
    </>
  )
}
