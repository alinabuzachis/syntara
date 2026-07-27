import { Button, Content, LabelGroup, Truncate } from '@patternfly/react-core'
import { RhUiAddIcon, RhUiEditFillIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { ActionsColumn, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { IAction, ThProps } from '@patternfly/react-table'
import { useCallback, useMemo, useState } from 'react'

import { NxConfirmationDialog } from '../../components/dialogs/NxConfirmationDialog'
import { DisabledWithTooltip } from '../../components/DisabledWithTooltip'
import { IconLabel } from '../../components/IconLabel'
import { NxLabel } from '../../components/labels/NxLabel'
import { NxListPanelTable, NxListPanelToolbar, NxListPanelView } from '../../components/panels/list/NxListPanel'
import { NxEmptyStateNoData } from '../../components/states/NxEmptyStateNoData'
import { useCursorReset } from '../../hooks/useCursorPagination'
import { useDialogState } from '../../hooks/useDialogState'
import { useAlerts } from '../../providers/alerts'
import { FilterOperatorEnum, FilterTypeEnum } from '../../types/filters'
import { getErrorMessage } from '../../utils/apiErrors'
import { detachPromise } from '../../utils/detachPromise'
import { RolePrincipalType } from '../access-management/RoleAssignmentTypes'

import { accessClient } from './accessClient'
import { buildPermissionRow, transformAssignmentFilters } from './assignmentUtils'
import { AssignRoleDialog } from './AssignRoleDialog'
import { EditAssignmentDialog } from './EditAssignmentDialog'
import { ProjectLabel, ScopeLabel } from './ScopeLabel'
import type { PermissionRow } from './types'
import { useAccessTabQuery } from './useAccessTabQuery'
import { useAssignmentPermissions } from './useAssignmentPermissions'

const BASE_FILTER_FIELD_DEFS = [
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
      { value: RolePrincipalType.USER, label: 'User' },
      { value: RolePrincipalType.GROUP, label: 'Group' },
      { value: RolePrincipalType.SERVICE_ACCOUNT, label: 'Service Account' },
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

const SORT_FIELDS: Record<number, string> = {
  0: 'principal_name',
  1: 'principal_type',
  2: 'role_name',
  3: 'scope',
  4: 'project_name',
}

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

const principalTypeFieldMapping = {
  [RolePrincipalType.USER]: { text: 'User', color: 'blue' },
  [RolePrincipalType.GROUP]: { text: 'Group', color: 'teal' },
  [RolePrincipalType.SERVICE_ACCOUNT]: { text: 'Service Account', color: 'green' },
} as const

function AssignmentsTableBody({
  rows,
  projectNameMap,
  getSortParams,
  onEdit,
  onDelete,
  permissions,
}: Readonly<{
  rows: PermissionRow[]
  projectNameMap: Map<string, string>
  getSortParams: (columnIndex: number) => ThProps['sort']
  onEdit: (row: PermissionRow) => void
  onDelete: (row: PermissionRow) => void
  permissions: ReturnType<typeof useAssignmentPermissions>
}>) {
  return (
    <>
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
        {rows.map((row) => (
          <Tr key={`${row.sourceEndpoint}-${row.id}`}>
            <Td dataLabel="Principal Name">
              <Truncate content={row.principalName} />
            </Td>
            <Td dataLabel="Principal Type">
              <NxLabel color={principalTypeFieldMapping[row.principalType].color}>
                {principalTypeFieldMapping[row.principalType].text}
              </NxLabel>
            </Td>
            <Td dataLabel="Role Name">
              <NxLabel color="purple">{row.assignmentName}</NxLabel>
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
                    <NxLabel key={name}>{name}</NxLabel>
                  ))}
                </LabelGroup>
              ) : (
                '-'
              )}
            </Td>
            <Td isActionCell>
              <ActionsColumn items={getAssignmentRowActions(row, permissions, onEdit, onDelete)} />
            </Td>
          </Tr>
        ))}
      </Tbody>
    </>
  )
}

export function AssignmentsTab() {
  const permissions = useAssignmentPermissions()
  const { showSuccess, showError } = useAlerts()
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const deleteDialog = useDialogState<PermissionRow>()
  const editDialog = useDialogState<PermissionRow>()

  const {
    cursor,
    resetPagination,
    filters,
    hasActiveFilters,
    handleFilterChange,
    handleClearAllFilters,
    getFooterProps,
    getSortParams,
    projectNameMap,
    filterFieldDefinitions,
    queryParams,
  } = useAccessTabQuery({
    baseFilterDefs: BASE_FILTER_FIELD_DEFS,
    sortFields: SORT_FIELDS,
    defaultSortField: 'principal_name',
    transformFilters: transformAssignmentFilters,
  })

  const assignmentsQuery = accessClient.useQuery('get', '/role_assignments', {
    params: { query: queryParams },
  })

  const { data, isPending, isFetching, error: queryError } = assignmentsQuery
  const rows = useMemo(() => (data?.resources ?? []).map(buildPermissionRow), [data?.resources])
  const refetch = useCallback(() => detachPromise(assignmentsQuery.refetch()), [assignmentsQuery])

  useCursorReset(rows.length, hasActiveFilters, cursor, isFetching, resetPagination)

  const { mutate: deleteRoleAssignment } = accessClient.useMutation('delete', '/role_assignments/{assignment_id}')
  const { mutate: deleteProjectRoleAssignment } = accessClient.useMutation(
    'delete',
    '/projects/{project_id}/role_assignments/{assignment_id}'
  )

  const handleDelete = (row: PermissionRow) => {
    const displayName = row.principalName
    const onSuccess = () => {
      showSuccess({ title: 'Permission removed', description: `Removed ${row.assignmentName} from ${displayName}` })
      refetch()
    }
    const onError = (error: unknown) => showError({ title: 'Remove failed', description: getErrorMessage(error) })
    const onSettled = deleteDialog.close
    const callbacks = { onSuccess, onError, onSettled }

    if (row.sourceEndpoint === 'project-role-assignments' && row.projectId) {
      deleteProjectRoleAssignment({ params: { path: { project_id: row.projectId, assignment_id: row.id } } }, callbacks)
    } else {
      deleteRoleAssignment({ params: { path: { assignment_id: row.id } } }, callbacks)
    }
  }

  const openAddDialog = permissions.canAssign ? () => setIsAddDialogOpen(true) : undefined
  const showToolbar = rows.length > 0 || hasActiveFilters
  const deleteItem = deleteDialog.item
  const editItem = editDialog.item

  return (
    <>
      <NxListPanelView
        tabKey="assignments"
        tabLabel="Assignments"
        isPending={isPending}
        isFetching={isFetching}
        error={queryError}
        onRetry={refetch}
        isEmpty={rows.length === 0}
        hasActiveFilters={hasActiveFilters}
        onClearAllFilters={handleClearAllFilters}
        noDataState={
          <NxEmptyStateNoData
            title="No assignments found"
            description="Assign roles to users or groups to grant access."
            buttonText="Add assignment"
            addData={openAddDialog}
          />
        }
        toolbar={
          showToolbar ? (
            <NxListPanelToolbar
              filters={filters}
              filterDefinitions={filterFieldDefinitions}
              onFilterChange={handleFilterChange}
              clearAllFilters={handleClearAllFilters}
              actions={
                <DisabledWithTooltip isDisabled={!permissions.canAssign} content={permissions.tooltips.assign}>
                  <Button
                    variant="primary"
                    icon={<RhUiAddIcon />}
                    isAriaDisabled={!permissions.canAssign}
                    onClick={openAddDialog}
                  >
                    Add assignment
                  </Button>
                </DisabledWithTooltip>
              }
            />
          ) : undefined
        }
        body={
          <>
            <Content>
              Assignments connect principals to roles, determining what each person can do. Each assignment can be
              scoped to a specific project or apply system-wide. Use this page to review, create, or revoke access in
              one place.
            </Content>
            <NxListPanelTable caption="Role assignments" footer={getFooterProps(data)}>
              <AssignmentsTableBody
                rows={rows}
                projectNameMap={projectNameMap}
                getSortParams={getSortParams}
                onEdit={editDialog.open}
                onDelete={deleteDialog.open}
                permissions={permissions}
              />
            </NxListPanelTable>
          </>
        }
      />

      {isAddDialogOpen && <AssignRoleDialog onClose={() => setIsAddDialogOpen(false)} onSuccess={refetch} />}

      {deleteItem != null && (
        <NxConfirmationDialog
          isOpen={deleteDialog.isOpen}
          onClose={deleteDialog.close}
          onConfirm={() => handleDelete(deleteItem)}
          title="Remove assignment?"
          confirmLabel="Remove"
          confirmVariant="danger"
          titleIconVariant="warning"
        >
          This removes role <strong>{deleteItem.assignmentName}</strong> from{' '}
          <strong>{deleteItem.principalName}</strong>
          {deleteItem.scopeType === 'project' && (
            <>
              {' '}
              in project <strong>{deleteItem.scopeName}</strong>
            </>
          )}
          . The associated permissions will be revoked.
        </NxConfirmationDialog>
      )}

      {editItem != null && (
        <EditAssignmentDialog
          row={editItem}
          displayName={editItem.principalName}
          onClose={editDialog.close}
          onSuccess={refetch}
        />
      )}
    </>
  )
}
