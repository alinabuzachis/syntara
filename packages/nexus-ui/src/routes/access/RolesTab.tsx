import { Button, Label, LabelGroup, Flex, FlexItem, StackItem, Truncate } from '@patternfly/react-core'
import { RhUiAddIcon, RhUiEditFillIcon, RhUiLockIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { ActionsColumn, ExpandableRowContent, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { IAction, ThProps } from '@patternfly/react-table'
import { useCallback, useMemo, useState } from 'react'

import { ConfirmationDialog } from '../../components/ConfirmationDialog'
import { EmptyStateFilter } from '../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../components/EmptyStateNoData'
import { FilterBar } from '../../components/filters'
import { IconLabel } from '../../components/IconLabel'
import { NxPageBody } from '../../components/layout/NxPage'
import { NxPanelContentStack } from '../../components/layout/NxPanelContentStack'
import { useQueryState } from '../../components/states/useQueryState'
import { ScrollableTableContainer } from '../../components/table/ScrollableTableContainer'
import { useAlerts } from '../../providers/alerts'
import { FilterOperatorEnum, FilterTypeEnum } from '../../types/filters'
import { getErrorMessage } from '../../utils/apiErrors'
import { detachPromise } from '../../utils/detachPromise'

import { accessClient } from './accessClient'
import { AddRoleDialog } from './AddRoleDialog'
import { EditRoleDialog } from './EditRoleDialog'
import { buildAccessApiQueryParams, buildProjectFilterDefs, ROLE_SCOPE_OPTIONS } from './scopeFilterUtils'
import { ProjectLabel, ScopeLabel } from './ScopeLabel'
import type { RoleRead } from './types'
import { useBuiltinListState } from './useBuiltinListState'
import { useProjectNameMap } from './useProjectNameMap'

const BASE_FILTER_FIELD_DEFS = [
  {
    key: 'name',
    label: 'Name',
    type: FilterTypeEnum.TEXT,
    operators: [FilterOperatorEnum.CONTAINS],
    defaultOperator: FilterOperatorEnum.CONTAINS,
    placeholder: 'Filter by name',
  },
  {
    key: 'scope',
    label: 'Scope',
    type: FilterTypeEnum.SELECT,
    options: ROLE_SCOPE_OPTIONS,
    placeholder: 'Filter by scope',
  },
  {
    key: 'project',
    label: 'Project',
    type: FilterTypeEnum.SELECT,
    options: [],
    placeholder: 'Filter by project',
  },
  {
    key: 'type',
    label: 'Type',
    type: FilterTypeEnum.SELECT,
    options: [
      { value: 'builtin', label: 'Built-in' },
      { value: 'custom', label: 'Custom' },
    ],
    placeholder: 'Filter by type',
  },
]

// Column index → API sort field (offset by 1 for the expand chevron column)
const sortFieldByColumn: Record<number, string> = {
  1: 'name',
  3: 'scope',
  4: 'project_id',
  5: 'is_builtin',
}

function getRoleActions(role: RoleRead, onEdit: (r: RoleRead) => void, onDelete: (r: RoleRead) => void): IAction[] {
  return [
    {
      title: <IconLabel icon={<RhUiEditFillIcon />}>Edit role</IconLabel>,
      onClick: () => onEdit(role),
    },
    { isSeparator: true },
    {
      title: <IconLabel icon={<RhUiTrashIcon />}>Delete role</IconLabel>,
      onClick: () => onDelete(role),
    },
  ]
}

const EXPANDABLE_COLUMN_COUNT = 7

function RolesTable({
  roles,
  projectNameMap,
  expandedRows,
  allRowsExpanded,
  onToggleRow,
  onCollapseAll,
  getSortParams,
  onEdit,
  onDelete,
}: Readonly<{
  roles: RoleRead[]
  projectNameMap: Map<string, string>
  expandedRows: Set<string>
  allRowsExpanded: boolean
  onToggleRow: (roleId: string) => void
  onCollapseAll: () => void
  getSortParams: (columnIndex: number) => ThProps['sort']
  onEdit: (role: RoleRead) => void
  onDelete: (role: RoleRead) => void
}>) {
  return (
    <>
      <Thead>
        <Tr>
          <Th
            expand={{
              areAllExpanded: !allRowsExpanded,
              collapseAllAriaLabel: allRowsExpanded ? 'Collapse all' : 'Expand all',
              onToggle: onCollapseAll,
            }}
            aria-label="Row expansion"
          />
          <Th sort={getSortParams(1)}>Name</Th>
          <Th>Description</Th>
          <Th sort={getSortParams(3)} modifier="nowrap">
            Scope
          </Th>
          <Th sort={getSortParams(4)} modifier="nowrap">
            Project
          </Th>
          <Th sort={getSortParams(5)} modifier="nowrap">
            Type
          </Th>
          <Th screenReaderText="Actions" />
        </Tr>
      </Thead>
      {roles.map((role, rowIndex) => {
        const isExpanded = expandedRows.has(role.id)
        return (
          <Tbody key={role.id} isExpanded={isExpanded}>
            <Tr isContentExpanded={isExpanded}>
              <Td
                expand={{
                  rowIndex,
                  isExpanded,
                  onToggle: () => onToggleRow(role.id),
                }}
              />
              <Td dataLabel="Name">
                <Truncate content={role.name} />
              </Td>
              <Td dataLabel="Description">
                <Truncate content={role.description ?? '-'} />
              </Td>
              <Td dataLabel="Scope">
                <ScopeLabel scope={role.scope} />
              </Td>
              <Td dataLabel="Project">
                <ProjectLabel projectId={role.project_id} projectNameMap={projectNameMap} />
              </Td>
              <Td dataLabel="Type">
                {role.is_builtin ? (
                  <Label color="grey" icon={<RhUiLockIcon />} isCompact>
                    Built-in
                  </Label>
                ) : (
                  <Label color="blue" isCompact>
                    Custom
                  </Label>
                )}
              </Td>
              <Td isActionCell>
                {!role.is_builtin && <ActionsColumn items={getRoleActions(role, onEdit, onDelete)} />}
              </Td>
            </Tr>
            <Tr isExpanded={isExpanded}>
              <Td colSpan={EXPANDABLE_COLUMN_COUNT}>
                <ExpandableRowContent>
                  <LabelGroup isCompact numLabels={Infinity}>
                    {(role.policies ?? []).map((policy) => (
                      <Label key={policy} color="grey" isCompact>
                        {policy}
                      </Label>
                    ))}
                  </LabelGroup>
                </ExpandableRowContent>
              </Td>
            </Tr>
          </Tbody>
        )
      })}
    </>
  )
}

export function RolesTab() {
  const {
    filters,
    hasActiveFilters,
    handleFilterChange,
    clearAllFilters,
    getSortParams,
    queryParams: baseQueryParams,
    page,
    perPage,
    handlePerPageChange,
    goToPrevPage,
    goToNextPage,
  } = useBuiltinListState(sortFieldByColumn)
  const [roleToEdit, setRoleToEdit] = useState<RoleRead | null>(null)
  const [roleToDelete, setRoleToDelete] = useState<RoleRead | null>(null)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const { showSuccess, showError } = useAlerts()

  // Fetch projects to resolve project names in the scope column/filter.
  const { projectNameMap } = useProjectNameMap()

  const filterFieldDefinitions = useMemo(
    () => buildProjectFilterDefs([...BASE_FILTER_FIELD_DEFS], projectNameMap),
    [projectNameMap]
  )

  const queryParams = useMemo(() => buildAccessApiQueryParams(baseQueryParams, filters), [baseQueryParams, filters])

  const rolesQuery = accessClient.useQuery('get', '/roles', {
    params: { query: queryParams },
  })

  const roles = useMemo(() => rolesQuery.data?.resources ?? [], [rolesQuery.data?.resources])

  const allRowsExpanded = roles.length > 0 && roles.every((r) => expandedRows.has(r.id))

  const handleToggleRow = useCallback((roleId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(roleId)) {
        next.delete(roleId)
      } else {
        next.add(roleId)
      }
      return next
    })
  }, [])

  const handleCollapseAll = useCallback(() => {
    if (allRowsExpanded) {
      setExpandedRows(new Set())
    } else {
      setExpandedRows(new Set(roles.map((r) => r.id)))
    }
  }, [allRowsExpanded, roles])

  const { mutate: deleteRole } = accessClient.useMutation('delete', '/roles/{role_id}')

  const handleRolesChanged = () => {
    detachPromise(rolesQuery.refetch())
  }

  const handleDelete = () => {
    if (!roleToDelete) return
    deleteRole(
      { params: { path: { role_id: roleToDelete.id } } },
      {
        onSuccess: () => {
          showSuccess({ title: 'Role deleted', description: `Deleted role "${roleToDelete.name}"` })
          handleRolesChanged()
        },
        onError: (error) => {
          showError({ title: 'Failed to delete role', description: getErrorMessage(error) })
        },
        onSettled: () => setRoleToDelete(null),
      }
    )
  }

  // Loading/error states
  const queryState = useQueryState(rolesQuery, {
    title: 'Error loading roles',
    onRetry: () => detachPromise(rolesQuery.refetch()),
  })

  if (queryState) {
    return (
      <>
        {queryState}
        {isAddDialogOpen && <AddRoleDialog onClose={() => setIsAddDialogOpen(false)} onSuccess={handleRolesChanged} />}
      </>
    )
  }

  if (roles.length === 0 && !hasActiveFilters) {
    return (
      <>
        <EmptyStateNoData title="No roles found" description="No roles are available." />
        {isAddDialogOpen && <AddRoleDialog onClose={() => setIsAddDialogOpen(false)} onSuccess={handleRolesChanged} />}
      </>
    )
  }

  return (
    <>
      <NxPanelContentStack>
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
              <Button variant="primary" icon={<RhUiAddIcon />} onClick={() => setIsAddDialogOpen(true)}>
                Create role
              </Button>
            </FlexItem>
          </Flex>
        </StackItem>

        {roles.length === 0 ? (
          <NxPageBody isCentered>
            <EmptyStateFilter clearAllFilters={clearAllFilters} />
          </NxPageBody>
        ) : (
          <ScrollableTableContainer
            aria-label="Roles"
            isExpandable
            footer={{
              page,
              perPage,
              total: rolesQuery.data?.total ?? null,
              hasNext: !!rolesQuery.data?.next,
              onPrev: goToPrevPage,
              onNext: () => goToNextPage(rolesQuery.data?.next ?? null),
              onPerPageChange: handlePerPageChange,
            }}
          >
            <RolesTable
              roles={roles}
              projectNameMap={projectNameMap}
              expandedRows={expandedRows}
              allRowsExpanded={allRowsExpanded}
              onToggleRow={handleToggleRow}
              onCollapseAll={handleCollapseAll}
              getSortParams={getSortParams}
              onEdit={setRoleToEdit}
              onDelete={setRoleToDelete}
            />
          </ScrollableTableContainer>
        )}
      </NxPanelContentStack>

      {isAddDialogOpen && <AddRoleDialog onClose={() => setIsAddDialogOpen(false)} onSuccess={handleRolesChanged} />}

      {roleToEdit && (
        <EditRoleDialog role={roleToEdit} onClose={() => setRoleToEdit(null)} onSuccess={handleRolesChanged} />
      )}

      <ConfirmationDialog
        isOpen={!!roleToDelete}
        onClose={() => setRoleToDelete(null)}
        onConfirm={handleDelete}
        title="Delete role?"
        confirmLabel="Delete"
        confirmVariant="danger"
        titleIconVariant="warning"
        destructiveAcknowledgement={{
          checkboxId: 'delete-role-ack',
          label: 'I understand this role will be permanently deleted.',
        }}
      >
        The role <strong>{roleToDelete?.name}</strong> will be deleted. Assignments that use this role will lose access.
        This cannot be undone.
      </ConfirmationDialog>
    </>
  )
}
