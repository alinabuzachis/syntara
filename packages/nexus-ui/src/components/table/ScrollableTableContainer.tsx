import { Button, Content, ContentVariants, Flex, FlexItem, Pagination, Stack, StackItem } from '@patternfly/react-core'
import { RhUiCaretLeftIcon, RhUiCaretRightIcon } from '@patternfly/react-icons'
import { Table } from '@patternfly/react-table'
import type { CSSProperties, ReactNode } from 'react'

import { scrollableTableShellStackStyle } from '../../app/panelContentStackStyle'
import { AppPanel } from '../AppPanel'

export type TableFooterProps = {
  /** Content to display (e.g., count, status). Used as footer label; with prev/next, compact buttons render beside it; with page/perPage, Pagination is used. */
  content: ReactNode
  /** Optional previous page cursor */
  prev?: string | null
  /** Optional next page cursor */
  next?: string | null
  /** Callback when previous page is clicked */
  onPrev?: () => void
  /** Callback when next page is clicked */
  onNext?: () => void
  /** Current page number (1-based). When present with perPage, PF Pagination is rendered. */
  page?: number
  /** Current items per page */
  perPage?: number
  /** Total item count (used for pagination display) */
  total?: number | null
  /** Callback when items per page changes */
  onPerPageChange?: (perPage: number) => void
}

type ScrollableTableContainerProps = {
  /** The table content (Thead, Tbody, etc.) */
  children: ReactNode
  /** Optional footer content (e.g., pagination) - can be a ReactNode or TableFooterProps */
  footer?: ReactNode | TableFooterProps
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
              }}
            >
              {typeof footer === 'object' && 'content' in footer ? <TableFooterContent footer={footer} /> : footer}
            </StackItem>
          )}
        </Stack>
      </AppPanel>
    </StackItem>
  )
}

function TableFooterContent({ footer }: Readonly<{ footer: TableFooterProps }>) {
  if (footer.page != null && footer.perPage != null) {
    const { page, perPage } = footer
    const hasNext = !!footer.next
    const itemCount = footer.total ?? (hasNext ? (page + 1) * perPage : page * perPage)
    return (
      <Pagination
        itemCount={itemCount}
        page={page}
        perPage={perPage}
        onSetPage={(_event, newPage) => {
          if (newPage > page) {
            footer.onNext?.()
          } else {
            footer.onPrev?.()
          }
        }}
        onPerPageSelect={(_event, newPerPage) => footer.onPerPageChange?.(newPerPage)}
        variant="bottom"
        isCompact
        style={{ justifyContent: 'space-between' }}
      />
    )
  }

  return (
    <Flex
      justifyContent={{ default: 'justifyContentSpaceBetween' }}
      alignItems={{ default: 'alignItemsCenter' }}
      style={{
        padding: 'var(--pf-t--global--spacer--md) var(--pf-t--global--spacer--lg)',
      }}
    >
      <FlexItem>
        <Content component={ContentVariants.p}>{footer.content}</Content>
      </FlexItem>
      {(footer.prev || footer.next) && (
        <Flex gap={{ default: 'gapSm' }}>
          <Button variant="plain" isDisabled={!footer.prev} onClick={footer.onPrev} aria-label="Previous page">
            <RhUiCaretLeftIcon /> Previous
          </Button>
          <Button variant="plain" isDisabled={!footer.next} onClick={footer.onNext} aria-label="Next page">
            Next <RhUiCaretRightIcon />
          </Button>
        </Flex>
      )}
    </Flex>
  )
}
