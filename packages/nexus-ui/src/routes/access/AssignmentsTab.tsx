import { Button, Flex, FlexItem, Label, LabelGroup, Stack, StackItem } from '@patternfly/react-core'
import { PlusIcon, RhUiEditFillIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { IAction } from '@patternfly/react-table'
import { useMemo, useState } from 'react'

import { ConfirmationDialog } from '../../components/ConfirmationDialog'
import { EmptyStateFilter } from '../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../components/EmptyStateNoData'
import { FilterBar } from '../../components/filters'
import { IconLabel } from '../../components/IconLabel'
import type { FilterFieldDefinition } from '../../types/filters'
import { FilterOperatorEnum, FilterTypeEnum } from '../../types/filters'

import { AssignRoleDialog } from './AssignRoleDialog'
import { EditAssignmentDialog } from './EditAssignmentDialog'
import { PaginationFooter } from './PaginationFooter'
import { buildProjectFilterDefs } from './scopeFilterUtils'
import { ProjectLabel, ScopeLabel } from './ScopeLabel'
import type { PermissionRow } from './types'
import { useAssignmentsData } from './useAssignmentsData'

const baseFilterDefs: FilterFieldDefinition[] = [
  {
    key: 'name',
    label: 'Principal Name',
    type: FilterTypeEnum.TEXT,
    operators: [FilterOperatorEnum.CONTAINS],
    defaultOperator: FilterOperatorEnum.CONTAINS,
    placeholder: 'Filter by principal name',
  },
  {
    key: 'role_name',
    label: 'Role Name',
    type: FilterTypeEnum.TEXT,
    operators: [FilterOperatorEnum.CONTAINS],
    defaultOperator: FilterOperatorEnum.CONTAINS,
    placeholder: 'Filter by role name',
  },
  {
    key: 'type',
    label: 'Principal Type',
    type: FilterTypeEnum.SELECT,
    options: [
      { value: 'user', label: 'User' },
      { value: 'group', label: 'Group' },
    ],
    placeholder: 'Filter by principal type',
  },
  {
    key: 'scope',
    label: 'Scope',
    type: FilterTypeEnum.SELECT,
    options: [
      { value: 'system', label: 'System' },
      { value: 'project', label: 'Project' },
    ],
    placeholder: 'Filter by scope',
  },
  {
    key: 'project',
    label: 'Project',
    type: FilterTypeEnum.SELECT,
    options: [],
    placeholder: 'Filter by project',
  },
]

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

  const filterFieldDefinitions = useMemo(() => buildProjectFilterDefs(baseFilterDefs, projectNameMap), [projectNameMap])

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
                  <Th width={15} sort={getSortParams(0)}>
                    Principal Name
                  </Th>
                  <Th width={10} sort={getSortParams(1)} modifier="nowrap">
                    Principal Type
                  </Th>
                  <Th width={10} sort={getSortParams(2)}>
                    Role Name
                  </Th>
                  <Th width={10} sort={getSortParams(3)} modifier="nowrap">
                    Scope
                  </Th>
                  <Th width={10} sort={getSortParams(4)} modifier="nowrap">
                    Project
                  </Th>
                  <Th width={30}>Policies</Th>
                  <Th screenReaderText="Actions" />
                </Tr>
              </Thead>
              <Tbody>
                {sortedRows.map((row) => (
                  <Tr key={`${row.sourceEndpoint}-${row.id}`}>
                    <Td dataLabel="Principal Name">{row.principalName}</Td>
                    <Td dataLabel="Principal Type">
                      <Label color={row.principalType === 'user' ? 'blue' : 'teal'} isCompact>
                        {row.principalType === 'user' ? 'User' : 'Group'}
                      </Label>
                    </Td>
                    <Td dataLabel="Role Name">
                      <Label color="purple" isCompact>
                        {row.assignmentName}
                      </Label>
                    </Td>
                    <Td dataLabel="Scope">
                      <ScopeLabel scope={row.scopeType} />
                    </Td>
                    <Td dataLabel="Project">
                      <ProjectLabel projectId={row.projectId} projectNameMap={projectNameMap} />
                    </Td>
                    <Td dataLabel="Policies">
                      {row.rolePolicies.length > 0 ? (
                        <LabelGroup numLabels={3}>
                          {row.rolePolicies.map((name) => (
                            <Label key={name} isCompact>
                              {name}
                            </Label>
                          ))}
                        </LabelGroup>
                      ) : (
                        '-'
                      )}
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

      <ConfirmationDialog
        isOpen={!!rowToDelete}
        onClose={() => setRowToDelete(null)}
        onConfirm={() => {
          if (rowToDelete) {
            handleDelete(rowToDelete, () => setRowToDelete(null))
          }
        }}
        title="Remove assignment?"
        confirmLabel="Remove"
        confirmVariant="danger"
        titleIconVariant="warning"
      >
        Remove role <strong>{rowToDelete?.assignmentName}</strong> from <strong>{rowToDelete?.principalName}</strong>
        {rowToDelete?.scopeType === 'project' && (
          <>
            {' '}
            in project <strong>{rowToDelete.scopeName}</strong>
          </>
        )}
        ? This will revoke the associated permissions.
      </ConfirmationDialog>

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
