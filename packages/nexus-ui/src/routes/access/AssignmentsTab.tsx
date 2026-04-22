import {
  Button,
  Flex,
  FlexItem,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Stack,
  StackItem,
} from '@patternfly/react-core'
import { PlusIcon, RhUiEditFillIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { IAction } from '@patternfly/react-table'
import { useMemo, useState } from 'react'

import { EmptyStateFilter } from '../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../components/EmptyStateNoData'
import { FilterBar } from '../../components/filters'
import { IconLabel } from '../../components/IconLabel'
import { FilterOperatorEnum, FilterTypeEnum } from '../../types/filters'

import { AssignRoleDialog } from './AssignRoleDialog'
import { EditAssignmentDialog } from './EditAssignmentDialog'
import { PaginationFooter } from './PaginationFooter'
import { buildFilterDefsWithScope } from './scopeFilterUtils'
import { ScopeLabel } from './ScopeLabel'
import type { PermissionRow } from './types'
import { useAssignmentsData } from './useAssignmentsData'

// ── Delete Confirmation Modal ─────────────────────────────────────────────

function DeleteAssignmentModal({
  row,
  onClose,
  onConfirm,
}: Readonly<{ row: PermissionRow | null; onClose: () => void; onConfirm: () => void }>) {
  return (
    <Modal isOpen={!!row} onClose={onClose} variant="small">
      <ModalHeader title="Remove assignment?" titleIconVariant="warning" />
      <ModalBody>
        Remove role <strong>{row?.assignmentName}</strong> from <strong>{row?.principalName}</strong>
        {row?.scopeType === 'project' && (
          <>
            {' '}
            in project <strong>{row.scopeName}</strong>
          </>
        )}
        ? This will revoke the associated permissions.
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm}>
          Remove
        </Button>
      </ModalFooter>
    </Modal>
  )
}

// ── Component ──────────────────────────────────────────────────────────────

export function AssignmentsTab() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [rowToDelete, setRowToDelete] = useState<PermissionRow | null>(null)
  const [rowToEdit, setRowToEdit] = useState<PermissionRow | null>(null)

  const {
    filters,
    handleFilterChange,
    clearAllFilters,
    getSortParams,
    projectNameMap,
    allRows,
    sortedRows,
    hasActiveFilters,
    refetchAll,
    handleDelete,
  } = useAssignmentsData()

  const filterFieldDefinitions = useMemo(
    () =>
      buildFilterDefsWithScope(
        [
          {
            key: 'name',
            label: 'Name',
            type: FilterTypeEnum.TEXT,
            operators: [FilterOperatorEnum.CONTAINS],
            defaultOperator: FilterOperatorEnum.CONTAINS,
            placeholder: 'Filter by name',
          },
          {
            key: 'type',
            label: 'Type',
            type: FilterTypeEnum.SELECT,
            options: [
              { value: 'user', label: 'User' },
              { value: 'group', label: 'Group' },
            ],
            placeholder: 'Filter by type',
          },
          {
            key: 'scope',
            label: 'Scope',
            type: FilterTypeEnum.SELECT,
            options: [],
            placeholder: 'Filter by scope',
          },
        ],
        projectNameMap
      ),
    [projectNameMap]
  )

  const getAssignmentActions = (row: PermissionRow): IAction[] => [
    {
      title: <IconLabel icon={<RhUiEditFillIcon />}>Edit assignment</IconLabel>,
      onClick: () => setRowToEdit(row),
    },
    { isSeparator: true },
    {
      title: <IconLabel icon={<RhUiTrashIcon />}>Delete assignment</IconLabel>,
      onClick: () => setRowToDelete(row),
    },
  ]

  if (allRows.length === 0 && !hasActiveFilters) {
    return (
      <EmptyStateNoData
        title="No assignments found"
        description="Assign roles to users or groups to grant access."
        buttonText="Add assignment"
        addData={() => setIsAddDialogOpen(true)}
      />
    )
  }

  return (
    <>
      <Stack style={{ height: '100%' }}>
        <StackItem>
          <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapMd' }}>
            <FlexItem grow={{ default: 'grow' }}>
              <FilterBar
                fieldDefinitions={filterFieldDefinitions}
                filters={filters}
                onFilterChange={handleFilterChange}
                showClearAll={true}
                clearAllFilters={clearAllFilters}
              />
            </FlexItem>
            <FlexItem>
              <Button variant="primary" icon={<PlusIcon />} onClick={() => setIsAddDialogOpen(true)}>
                Add assignment
              </Button>
            </FlexItem>
          </Flex>
        </StackItem>

        {sortedRows.length === 0 ? (
          <StackItem isFilled style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <EmptyStateFilter clearAllFilters={clearAllFilters} />
          </StackItem>
        ) : (
          <StackItem isFilled style={{ minHeight: 0, overflow: 'auto' }}>
            <Table aria-label="Role assignments" isStriped style={{ width: '100%' }}>
              <Thead>
                <Tr>
                  <Th width={25} sort={getSortParams(0)}>
                    Principal
                  </Th>
                  <Th width={10} sort={getSortParams(1)} modifier="nowrap">
                    Type
                  </Th>
                  <Th width={20} sort={getSortParams(2)}>
                    Role
                  </Th>
                  <Th width={15} sort={getSortParams(3)} modifier="nowrap">
                    Scope
                  </Th>
                  <Th screenReaderText="Actions" />
                </Tr>
              </Thead>
              <Tbody>
                {sortedRows.map((row) => (
                  <Tr key={`${row.sourceEndpoint}-${row.id}`}>
                    <Td dataLabel="Principal">{row.principalName}</Td>
                    <Td dataLabel="Type">
                      <Label color={row.principalType === 'user' ? 'blue' : 'teal'} isCompact>
                        {row.principalType === 'user' ? 'User' : 'Group'}
                      </Label>
                    </Td>
                    <Td dataLabel="Role">
                      <Label color="purple" isCompact>
                        {row.assignmentName}
                      </Label>
                    </Td>
                    <Td dataLabel="Scope">
                      <ScopeLabel projectId={row.projectId} projectNameMap={projectNameMap} />
                    </Td>
                    <Td isActionCell>
                      <ActionsColumn items={getAssignmentActions(row)} />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </StackItem>
        )}
        <PaginationFooter
          page={1}
          perPage={sortedRows.length}
          total={sortedRows.length}
          hasNext={false}
          onPrev={() => {}}
          onNext={() => {}}
          onPerPageChange={() => {}}
        />
      </Stack>

      {isAddDialogOpen && <AssignRoleDialog onClose={() => setIsAddDialogOpen(false)} onSuccess={refetchAll} />}

      <DeleteAssignmentModal
        row={rowToDelete}
        onClose={() => setRowToDelete(null)}
        onConfirm={() => {
          if (rowToDelete) {
            handleDelete(rowToDelete, () => setRowToDelete(null))
          }
        }}
      />

      {rowToEdit && (
        <EditAssignmentDialog
          row={rowToEdit}
          displayName={rowToEdit.principalName}
          onClose={() => setRowToEdit(null)}
          onSuccess={refetchAll}
        />
      )}
    </>
  )
}
