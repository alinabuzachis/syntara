import { Pagination, StackItem } from '@patternfly/react-core'

type PaginationFooterProps = {
  page: number
  perPage: number
  total?: number | null
  hasNext: boolean
  onPrev: () => void
  onNext: () => void
  onPerPageChange: (perPage: number) => void
}

export function PaginationFooter({
  page,
  perPage,
  total,
  hasNext,
  onPrev,
  onNext,
  onPerPageChange,
}: Readonly<PaginationFooterProps>) {
  // When total is known, use it. Otherwise estimate from current page state.
  const itemCount = total ?? (hasNext ? page * perPage + 1 : page * perPage)

  return (
    <StackItem style={{ flex: '0 0 auto' }}>
      <Pagination
        itemCount={itemCount}
        page={page}
        perPage={perPage}
        onSetPage={(_event, newPage) => {
          if (newPage > page) onNext()
          else onPrev()
        }}
        onPerPageSelect={(_event, newPerPage) => onPerPageChange(newPerPage)}
        variant="bottom"
        isCompact
        style={{ justifyContent: 'space-between' }}
      />
    </StackItem>
  )
}
