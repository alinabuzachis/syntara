import { Content, ContentVariants } from '@patternfly/react-core'

import { formatDateTime } from '../../../utils/dateUtils'

import styles from './UserTimestamp.module.css'

type UserTimestampProps = {
  user?: string | null
  timestamp?: string
  /** Use subtle color for the timestamp (default: true). Set false for neutral color. */
  subtleTimestamp?: boolean
  /** Render user and date on a single line (default: false). Use true for table columns. */
  inline?: boolean
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
  const formattedDate = formatDateTime(timestamp)

  if (inline) {
    return (
      <Content component={ContentVariants.p} className={styles.inlineWrapper}>
        {user && (
          <>
            <Content component={ContentVariants.a} className={styles.inlineUser}>
              {user}
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
      {user && (
        <Content component={ContentVariants.p} className={styles.user}>
          {user}
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
