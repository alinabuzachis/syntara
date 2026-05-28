import { Stack, StackItem } from '@patternfly/react-core'
import { Table } from '@patternfly/react-table'
import type { ReactNode } from 'react'

import { NxPanel } from '../layout/NxPanel'

import styles from './NxScrollableTableContainer.module.css'
import { PaginationFooter, type PaginationFooterProps } from './PaginationFooter'

/** Footer props passed to {@link NxScrollableTableContainer}. Forwarded directly to {@link PaginationFooter}. */
export type TableFooterProps = PaginationFooterProps

type NxScrollableTableContainerProps = {
  /** The table content (Thead, Tbody, etc.) */
  children: ReactNode
  /** Pagination footer props — always renders {@link PaginationFooter} when provided. */
  footer?: TableFooterProps
  /** Aria label for the table */
  'aria-label': string
  /** Whether the table is expandable (affects table layout) */
  isExpandable?: boolean
  /** Opt out of fixed table layout when not expandable */
  useFixedLayout?: boolean
}

/**
 * A reusable container component for scrollable tables with sticky headers.
 * Provides consistent styling and layout for tables across the application.
 *
 * The root node is a PatternFly `StackItem` (`isFilled`). It must be a **direct** child of `Stack`;
 * wrapping it in another `StackItem` breaks flex layout (the table will not fill the panel height).
 */
export function NxScrollableTableContainer({
  children,
  footer,
  'aria-label': ariaLabel,
  isExpandable,
  useFixedLayout = true,
}: NxScrollableTableContainerProps) {
  const useFixed = !isExpandable && useFixedLayout
  return (
    <StackItem isFilled data-testid="scrollable-table-container-root" className={styles.root}>
      <NxPanel hasNoPadding isFullHeight isScrollable className={styles.panel}>
        <Stack className={styles.shellStack}>
          <StackItem isFilled className={styles.scrollContainer}>
            <Table
              aria-label={ariaLabel}
              isPlain
              isStickyHeader
              isExpandable={isExpandable}
              // NOTE: We deliberately do not use `table-layout: fixed` for expandable tables because
              // PatternFly's expandable row layout relies on the browser's automatic table layout to
              // correctly size columns and expansion control cells. For non-expandable tables, we use
              // a fixed layout to keep column widths stable.
              className={`${styles.table}${useFixed ? ` ${styles.tableFixedLayout}` : ''}`}
            >
              {children}
            </Table>
          </StackItem>
          {footer && (
            <StackItem className={styles.footer}>
              <PaginationFooter {...footer} />
            </StackItem>
          )}
        </Stack>
      </NxPanel>
    </StackItem>
  )
}
