import {
  Button,
  Content,
  ContentVariants,
  Flex,
  FlexItem,
  Label,
  LabelGroup,
  StackItem,
  Truncate,
} from '@patternfly/react-core'
import { RhUiAddIcon, RhUiEditFillIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { ActionsColumn, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { IAction } from '@patternfly/react-table'
import { useCallback, useMemo, useState } from 'react'

import { NxConfirmationDialog } from '../../components/dialogs/NxConfirmationDialog'
import { DisabledWithTooltip } from '../../components/DisabledWithTooltip'
import { FilterBar } from '../../components/filters'
import { IconLabel } from '../../components/IconLabel'
import { NxPageBody } from '../../components/layout/NxPage'
import { NxPanelContentStack } from '../../components/layout/NxPanelContentStack'
import { NxEmptyStateFilter } from '../../components/states/NxEmptyStateFilter'
import { NxEmptyStateNoData } from '../../components/states/NxEmptyStateNoData'
import { NxScrollableTableContainer } from '../../components/table/NxScrollableTableContainer'
import type { FilterFieldDefinition } from '../../types/filters'
import { FilterOperatorEnum, FilterTypeEnum } from '../../types/filters'

import { AssignRoleDialog } from './AssignRoleDialog'
import { EditAssignmentDialog } from './EditAssignmentDialog'
import { buildProjectFilterDefs } from './scopeFilterUtils'
import { ProjectLabel, ScopeLabel } from './ScopeLabel'
import type { PermissionRow } from './types'
import { useAssignmentPermissions } from './useAssignmentPermissions'
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

function getAssignmentRowActions(
  row: PermissionRow,
  permissions: ReturnType<typeof useAssignmentPermissions>,
  onEdit: (row: PermissionRow) => void,
  onDelete: (row: PermissionRow) => void
): IAction[] {
  return [
    {
      title: <IconLabel icon={<RhUiEditFillIcon />}>Edit assignment</IconLabel>,
      isAriaDisabled: !permissions.canAssign,
      tooltipProps: permissions.canAssign ? undefined : { content: permissions.tooltips.assign },
      onClick: permissions.canAssign ? () => onEdit(row) : undefined,
    },
    { isSeparator: true },
    {
      title: <IconLabel icon={<RhUiTrashIcon />}>Delete assignment</IconLabel>,
      isAriaDisabled: !permissions.canRevoke,
      tooltipProps: permissions.canRevoke ? undefined : { content: permissions.tooltips.revoke },
      onClick: permissions.canRevoke ? () => onDelete(row) : undefined,
    },
  ]
}

// ── Component ──────────────────────────────────────────────────────────────

export function AssignmentsTab() {
  const permissions = useAssignmentPermissions()
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

  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)

  const handlePerPageChange = useCallback((newPerPage: number) => {
    setPerPage(newPerPage)
    setPage(1)
  }, [])

  const handleFilterChangeWithReset = useCallback(
    (newFilters: typeof filters) => {
      handleFilterChange(newFilters)
      setPage(1)
    },
    [handleFilterChange]
  )

  const clearAllFiltersWithReset = useCallback(() => {
    clearAllFilters()
    setPage(1)
  }, [clearAllFilters])

  const paginatedRows = sortedRows.slice((page - 1) * perPage, page * perPage)

  if (allRows.length === 0 && !hasActiveFilters) {
    return (
      <>
        <NxEmptyStateNoData
          title="No assignments found"
          description="Assign roles to users or groups to grant access."
          buttonText="Add assignment"
          addData={permissions.canAssign ? () => setIsAddDialogOpen(true) : undefined}
        />
        {isAddDialogOpen && <AssignRoleDialog onClose={() => setIsAddDialogOpen(false)} onSuccess={refetchAll} />}
      </>
    )
  }

  return (
    <>
      <NxPanelContentStack>
        <StackItem>
          <Content component={ContentVariants.p} style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}>
            Assignments connect users and groups to roles, determining what each person can do. Each assignment can be
            scoped to a specific project or apply system-wide. Use this page to review, create, or revoke access in one
            place.
          </Content>
        </StackItem>
        <StackItem>
          <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapMd' }}>
            <FlexItem grow={{ default: 'grow' }}>
              <FilterBar
                fieldDefinitions={filterFieldDefinitions}
                filters={filters}
                onFilterChange={handleFilterChangeWithReset}
                showClearAll={true}
                clearAllFilters={clearAllFiltersWithReset}
              />
            </FlexItem>
            <FlexItem>
              <DisabledWithTooltip isDisabled={!permissions.canAssign} content={permissions.tooltips.assign}>
                <Button
                  variant="primary"
                  icon={<RhUiAddIcon />}
                  isAriaDisabled={!permissions.canAssign}
                  onClick={permissions.canAssign ? () => setIsAddDialogOpen(true) : undefined}
                >
                  Add assignment
                </Button>
              </DisabledWithTooltip>
            </FlexItem>
          </Flex>
        </StackItem>

        {sortedRows.length === 0 ? (
          <NxPageBody isCentered>
            <NxEmptyStateFilter clearAllFilters={clearAllFilters} />
          </NxPageBody>
        ) : (
          <NxScrollableTableContainer
            aria-label="Role assignments"
            footer={{
              page,
              perPage,
              total: sortedRows.length,
              hasNext: page * perPage < sortedRows.length,
              onPrev: () => setPage((p) => Math.max(1, p - 1)),
              onNext: () => setPage((p) => p + 1),
              onPerPageChange: handlePerPageChange,
            }}
          >
            <Thead>
              <Tr>
                <Th sort={getSortParams(0)}>Principal Name</Th>
                <Th sort={getSortParams(1)} modifier="nowrap">
                  Principal Type
                </Th>
                <Th sort={getSortParams(2)}>Role Name</Th>
                <Th sort={getSortParams(3)} modifier="nowrap">
                  Scope
                </Th>
                <Th sort={getSortParams(4)} modifier="nowrap">
                  Project
                </Th>
                <Th>Policies</Th>
                <Th screenReaderText="Actions" />
              </Tr>
            </Thead>
            <Tbody>
              {paginatedRows.map((row) => (
                <Tr key={`${row.sourceEndpoint}-${row.id}`}>
                  <Td dataLabel="Principal Name">
                    <Truncate content={row.principalName} />
                  </Td>
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
                    <ActionsColumn items={getAssignmentRowActions(row, permissions, setRowToEdit, setRowToDelete)} />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </NxScrollableTableContainer>
        )}
      </NxPanelContentStack>

      {isAddDialogOpen && <AssignRoleDialog onClose={() => setIsAddDialogOpen(false)} onSuccess={refetchAll} />}

      <NxConfirmationDialog
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
        This removes role <strong>{rowToDelete?.assignmentName}</strong> from{' '}
        <strong>{rowToDelete?.principalName}</strong>
        {rowToDelete?.scopeType === 'project' && (
          <>
            {' '}
            in project <strong>{rowToDelete.scopeName}</strong>
          </>
        )}
        . The associated permissions will be revoked.
      </NxConfirmationDialog>

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
