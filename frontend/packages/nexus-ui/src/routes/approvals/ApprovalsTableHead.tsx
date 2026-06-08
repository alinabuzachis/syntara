import { Checkbox, Tooltip } from '@patternfly/react-core'
import { Thead, Th, Tr } from '@patternfly/react-table'
import type { ThProps } from '@patternfly/react-table'

import { permissionTooltip } from '../../hooks/permissionUtils'

const DECIDE_TOOLTIP = permissionTooltip('approve or reject approvals', 'approval:decide')

export type ApprovalsTableHeadProps = {
  getSortParams: (columnIndex: number) => ThProps['sort']
  allRowsExpanded: boolean
  collapseAllAriaLabel: string
  onCollapseAll: (event: unknown, rowIndex: number, isOpen: boolean) => void
  showSelect?: boolean
  allPendingSelected?: boolean
  onSelectAll?: (checked: boolean) => void
  hasPendingApprovals?: boolean
  canDecideAnyApproval?: boolean
  isLoadingPermissions?: boolean
}

export function ApprovalsTableHead(props: Readonly<ApprovalsTableHeadProps>) {
  const {
    getSortParams,
    allRowsExpanded,
    collapseAllAriaLabel,
    onCollapseAll,
    showSelect = false,
    allPendingSelected = false,
    onSelectAll,
    hasPendingApprovals = false,
    canDecideAnyApproval = true,
    isLoadingPermissions = false,
  } = props

  const showDisabledWithTooltip = showSelect && !canDecideAnyApproval && !isLoadingPermissions

  return (
    <Thead>
      <Tr>
        {showSelect &&
          (showDisabledWithTooltip ? (
            <Th aria-label="Select all approvals">
              <Tooltip content={DECIDE_TOOLTIP}>
                <span>
                  <Checkbox
                    id="select-all-approvals"
                    isChecked={false}
                    isDisabled
                    aria-label="Select all approvals"
                    onChange={() => undefined}
                  />
                </span>
              </Tooltip>
            </Th>
          ) : (
            <Th
              select={{
                onSelect: (_event, isSelecting) => onSelectAll?.(isSelecting),
                isSelected: allPendingSelected,
                isHeaderSelectDisabled: !hasPendingApprovals,
              }}
              screenReaderText="Select all pending approvals"
            />
          ))}
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
