import { Stack, StackItem } from '@patternfly/react-core'
import { Table } from '@patternfly/react-table'
import type { CSSProperties, ReactNode } from 'react'

import { scrollableTableShellStackStyle } from '../../app/panelContentStackStyle'
import { AppPanel } from '../AppPanel'

import { PaginationFooter, type PaginationFooterProps } from './PaginationFooter'

/** Footer props passed to {@link ScrollableTableContainer}. Forwarded directly to {@link PaginationFooter}. */
export type TableFooterProps = PaginationFooterProps

type ScrollableTableContainerProps = {
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
export function ScrollableTableContainer({
  children,
  footer,
  'aria-label': ariaLabel,
  isExpandable,
  useFixedLayout = true,
}: ScrollableTableContainerProps) {
  return (
    <StackItem
      isFilled
      data-testid="scrollable-table-container-root"
      style={{
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <AppPanel hasNoPadding isFullHeight isScrollable style={{ boxShadow: 'none' }}>
        <Stack style={scrollableTableShellStackStyle}>
          <StackItem
            isFilled
            style={{ minHeight: 0, maxHeight: '100%', overflow: 'auto', width: '100%', position: 'relative' }}
          >
            <Table
              aria-label={ariaLabel}
              isPlain
              isStickyHeader
              isExpandable={isExpandable}
              style={
                {
                  '--pf-t--global--border--color--default': 'rgba(196, 181, 253, 0.2)',
                  // NOTE: We deliberately do not use `table-layout: fixed` for expandable tables because
                  // PatternFly's expandable row layout relies on the browser's automatic table layout to
                  // correctly size columns and expansion control cells. For non-expandable tables, we use
                  // a fixed layout to keep column widths stable.
                  ...(isExpandable || !useFixedLayout ? {} : { tableLayout: 'fixed' }),
                  width: '100%',
                } as CSSProperties
              }
            >
              {children}
            </Table>
          </StackItem>
          {footer && (
            <StackItem
              style={{
                flex: '0 0 auto',
                width: '100%',
                borderTop: '1px solid rgba(196, 181, 253, 0.2)',
                paddingBottom: 'var(--pf-t--global--spacer--sm)',
              }}
            >
              <PaginationFooter {...footer} />
            </StackItem>
          )}
        </Stack>
      </AppPanel>
    </StackItem>
  )
}
