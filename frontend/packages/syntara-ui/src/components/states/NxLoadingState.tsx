import { Flex, FlexItem, Spinner } from '@patternfly/react-core'

import styles from './NxLoadingState.module.css'

/** Centered full-height loading spinner — drop-in replacement for page or panel content while a query is in flight. */
export function NxLoadingState() {
  return (
    <Flex
      data-testid="loading-state"
      alignItems={{ default: 'alignItemsCenter' }}
      justifyContent={{ default: 'justifyContentCenter' }}
      className={styles.container}
    >
      <FlexItem>
        <Spinner size="xl" aria-label="Loading" />
      </FlexItem>
    </Flex>
  )
}
