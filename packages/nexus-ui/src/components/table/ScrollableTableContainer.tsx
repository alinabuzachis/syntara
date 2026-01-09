import {
  Button,
  Content,
  ContentVariants,
  CompassPanel,
  Flex,
  FlexItem,
  Stack,
  StackItem,
} from '@patternfly/react-core'
import { RhUiCaretLeftIcon, RhUiCaretRightIcon } from '@patternfly/react-icons'
import { Table } from '@patternfly/react-table'
import type { ReactNode } from 'react'

export interface TableFooterProps {
  /** Content to display (e.g., count, status). Pagination buttons appear on the right when prev/next are provided. */
  content: ReactNode
  /** Optional previous page cursor */
  prev?: string | null
  /** Optional next page cursor */
  next?: string | null
  /** Callback when previous page is clicked */
  onPrev?: () => void
  /** Callback when next page is clicked */
  onNext?: () => void
}

interface ScrollableTableContainerProps {
  /** The table content (Thead, Tbody, etc.) */
  children: ReactNode
  /** Optional footer content (e.g., pagination) - can be a ReactNode or TableFooterProps */
  footer?: ReactNode | TableFooterProps
  /** Aria label for the table */
  'aria-label': string
}

/**
 * A reusable container component for scrollable tables with sticky headers.
 * Provides consistent styling and layout for tables across the application.
 */
export function ScrollableTableContainer({ children, footer, 'aria-label': ariaLabel }: ScrollableTableContainerProps) {
  return (
    <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
      <CompassPanel hasNoPadding isFullHeight isScrollable>
        <Stack style={{ height: '100%', maxHeight: '100%', overflow: 'hidden', width: '100%' }}>
          <StackItem
            isFilled
            style={{ minHeight: 0, maxHeight: '100%', overflow: 'auto', width: '100%', position: 'relative' }}
          >
            <Table
              aria-label={ariaLabel}
              isPlain
              isStickyHeader
              style={
                {
                  '--pf-t--global--border--color--default': 'rgba(196, 181, 253, 0.2)',
                  tableLayout: 'fixed',
                  width: '100%',
                } as React.CSSProperties
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
              {typeof footer === 'object' && 'content' in footer ? (
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
                      <Button
                        variant="plain"
                        isDisabled={!footer.prev}
                        onClick={footer.onPrev}
                        aria-label="Previous page"
                      >
                        <RhUiCaretLeftIcon /> Previous
                      </Button>
                      <Button variant="plain" isDisabled={!footer.next} onClick={footer.onNext} aria-label="Next page">
                        Next <RhUiCaretRightIcon />
                      </Button>
                    </Flex>
                  )}
                </Flex>
              ) : (
                footer
              )}
            </StackItem>
          )}
        </Stack>
      </CompassPanel>
    </StackItem>
  )
}
