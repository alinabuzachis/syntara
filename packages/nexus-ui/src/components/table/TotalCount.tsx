interface TotalCountProps {
  /** The total number of items across all pages */
  total: number
}

/**
 * Displays a subdued "(of N total)" count, used in table footers
 * to show the total number of items when paginated.
 */
export function TotalCount({ total }: Readonly<TotalCountProps>) {
  return <span style={{ color: 'var(--pf-t--global--color--nonstatus--gray--default)' }}> (of {total} total)</span>
}
