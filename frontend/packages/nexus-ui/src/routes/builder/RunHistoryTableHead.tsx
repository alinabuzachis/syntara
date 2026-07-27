import { Table, Thead, Th, Tr } from '@patternfly/react-table'
import type { ThProps } from '@patternfly/react-table'

import styles from './WorkflowHistoryCard.module.css'

export type RunHistoryTableHeadProps = {
  getSortParams: (columnField: string) => ThProps['sort']
}

/** Compact sortable headers for the Run History panel. */
export function RunHistoryTableHead({ getSortParams }: Readonly<RunHistoryTableHeadProps>) {
  /* v8 ignore start -- phantom branches from compiled JSX props on compact Th headers */
  return (
    <div className={styles.sortHeader}>
      <Table aria-label="Run history sort" variant="compact" isPlain className={styles.sortTable}>
        <Thead>
          <Tr>
            <Th modifier="nowrap" sort={getSortParams('id')}>
              Run ID
            </Th>
            <Th modifier="nowrap" sort={getSortParams('workflow_version_id')}>
              Version
            </Th>
            <Th modifier="nowrap" sort={getSortParams('created_at')}>
              Started
            </Th>
            <Th modifier="nowrap">Duration</Th>
            <Th modifier="nowrap" sort={getSortParams('status')}>
              Status
            </Th>
          </Tr>
        </Thead>
      </Table>
    </div>
  )
  /* v8 ignore stop */
}
