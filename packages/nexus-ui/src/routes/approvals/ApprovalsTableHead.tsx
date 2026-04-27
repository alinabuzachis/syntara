import { Thead, Th, Tr } from '@patternfly/react-table'
import type { ThProps } from '@patternfly/react-table'

export type ApprovalsTableHeadProps = {
  getSortParams: (columnIndex: number) => ThProps['sort']
  allRowsExpanded: boolean
  collapseAllAriaLabel: string
  onCollapseAll: (event: unknown, rowIndex: number, isOpen: boolean) => void
}

export function ApprovalsTableHead(props: Readonly<ApprovalsTableHeadProps>) {
  const { getSortParams, allRowsExpanded, collapseAllAriaLabel, onCollapseAll } = props
  return (
    <Thead>
      <Tr>
        <Th
          expand={{
            areAllExpanded: !allRowsExpanded,
            collapseAllAriaLabel,
            onToggle: onCollapseAll,
          }}
          aria-label="Row expansion"
        />
        <Th modifier="nowrap" sort={getSortParams(0)}>
          Approval name
        </Th>
        <Th modifier="nowrap" sort={getSortParams(1)}>
          Workflow
        </Th>
        <Th modifier="nowrap" sort={getSortParams(2)}>
          Approval initiated
        </Th>
        <Th modifier="nowrap" sort={getSortParams(3)}>
          Actioned on
        </Th>
        <Th modifier="nowrap" sort={getSortParams(4)}>
          Status
        </Th>
      </Tr>
    </Thead>
  )
}
