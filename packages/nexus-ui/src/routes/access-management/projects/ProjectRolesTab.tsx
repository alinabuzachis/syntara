import { Button, Label, LabelGroup, Flex, FlexItem, Stack, StackItem } from '@patternfly/react-core'
import { PlusIcon, RhUiEditFillIcon, RhUiLockIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { IAction, ThProps } from '@patternfly/react-table'
import { useState } from 'react'

import { useAlerts } from '../../../components/alerts'
import { ConfirmationDialog } from '../../../components/ConfirmationDialog'
import { EmptyStateFilter } from '../../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../../components/EmptyStateNoData'
import { FilterBar } from '../../../components/filters'
import { IconLabel } from '../../../components/IconLabel'
import { useQueryState } from '../../../components/states/useQueryState'
import { useDialogState } from '../../../hooks/useDialogState'
import { getErrorMessage } from '../../../utils/apiErrors'
import { detachPromise } from '../../../utils/detachPromise'
import { accessClient } from '../../access/accessClient'
import { builtinFilterDefinitions } from '../../access/builtinFilterDefinitions'
import { PaginationFooter } from '../../access/PaginationFooter'
import type { ProjectRoleRead } from '../../access/types'
import { useBuiltinListState } from '../../access/useBuiltinListState'

import { AddProjectRoleDialog } from './AddProjectRoleDialog'
import { EditProjectRoleDialog } from './EditProjectRoleDialog'

const sortFieldByColumn: Record<number, string> = {
  0: 'name',
  3: 'is_builtin',
}

function ProjectRolesTable({
  roles,
  getSortParams,
  onEdit,
  onDelete,
}: Readonly<{
  roles: ProjectRoleRead[]
  getSortParams: (columnIndex: number) => ThProps['sort']
  onEdit: (role: ProjectRoleRead) => void
  onDelete: (role: ProjectRoleRead) => void
}>) {
  const getRoleActions = (role: ProjectRoleRead): IAction[] => [
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

  return (
    <Table aria-label="Project roles" isStriped style={{ width: '100%' }}>
      <Thead>
        <Tr>
          <Th sort={getSortParams(0)}>Name</Th>
          <Th>Description</Th>
          <Th>Policies</Th>
          <Th sort={getSortParams(3)} modifier="nowrap">
            Type
          </Th>
          <Th screenReaderText="Actions" />
        </Tr>
      </Thead>
      <Tbody>
        {roles.map((role) => (
          <Tr key={role.id}>
            <Td dataLabel="Name">{role.name}</Td>
            <Td dataLabel="Description">{role.description ?? '-'}</Td>
            <Td dataLabel="Policies">
              <LabelGroup isCompact numLabels={5}>
                {(role.policies ?? []).map((policy) => (
                  <Label key={policy} color="grey" isCompact>
                    {policy}
                  </Label>
                ))}
              </LabelGroup>
            </Td>
            <Td dataLabel="Type">
              {role.is_builtin ? (
                <Label color="yellow" icon={<RhUiLockIcon />} isCompact>
                  Built-in
                </Label>
              ) : (
                <Label color="blue" isCompact>
                  Custom
                </Label>
              )}
            </Td>
            <Td isActionCell>{!role.is_builtin && <ActionsColumn items={getRoleActions(role)} />}</Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  )
}

export function ProjectRolesTab({ projectId }: Readonly<{ projectId: string }>) {
  const {
    filters,
    hasActiveFilters,
    handleFilterChange,
    clearAllFilters,
    getSortParams,
    queryParams,
    page,
    perPage,
    handlePerPageChange,
    goToPrevPage,
    goToNextPage,
  } = useBuiltinListState(sortFieldByColumn)
  const [roleToEdit, setRoleToEdit] = useState<ProjectRoleRead | null>(null)
  const deleteDialog = useDialogState<ProjectRoleRead>()
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const { showSuccess, showError } = useAlerts()

  const rolesQuery = accessClient.useQuery('get', '/projects/{project_id}/roles', {
    params: {
      path: { project_id: projectId },
      query: queryParams,
    },
  })

  const roles = rolesQuery.data?.resources ?? []

  const { mutate: deleteRole } = accessClient.useMutation('delete', '/projects/{project_id}/roles/{role_id}')

  const handleRolesChanged = () => {
    detachPromise(rolesQuery.refetch())
  }

  const handleDelete = (role: ProjectRoleRead | null) => {
    if (!role) return
    deleteRole(
      { params: { path: { project_id: projectId, role_id: role.id } } },
      {
        onSuccess: () => {
          showSuccess(`Deleted role "${role.name}"`, 'Role Deleted')
          handleRolesChanged()
        },
        onError: (error) => {
          showError(getErrorMessage(error), 'Failed to Delete Role')
        },
        onSettled: () => deleteDialog.close(),
      }
    )
  }

  const queryState = useQueryState(rolesQuery, {
    title: 'Error loading roles',
    onRetry: () => detachPromise(rolesQuery.refetch()),
  })

  if (queryState) {
    return (
      <>
        {queryState}
        {isAddDialogOpen && (
          <AddProjectRoleDialog
            projectId={projectId}
            onClose={() => setIsAddDialogOpen(false)}
            onSuccess={handleRolesChanged}
          />
        )}
      </>
    )
  }

  if (roles.length === 0 && !hasActiveFilters) {
    return (
      <>
        <EmptyStateNoData
          title="No roles found"
          description="No roles are available for this project."
          buttonText="Add role"
          addData={() => setIsAddDialogOpen(true)}
        />
        {isAddDialogOpen && (
          <AddProjectRoleDialog
            projectId={projectId}
            onClose={() => setIsAddDialogOpen(false)}
            onSuccess={handleRolesChanged}
          />
        )}
      </>
    )
  }

  return (
    <>
      <Stack style={{ height: '100%' }}>
        <StackItem>
          <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapMd' }}>
            <FlexItem grow={{ default: 'grow' }}>
              <FilterBar
                fieldDefinitions={builtinFilterDefinitions}
                filters={filters}
                onFilterChange={handleFilterChange}
                showClearAll={true}
                clearAllFilters={clearAllFilters}
              />
            </FlexItem>
            <FlexItem>
              <Button variant="primary" icon={<PlusIcon />} onClick={() => setIsAddDialogOpen(true)}>
                Add role
              </Button>
            </FlexItem>
          </Flex>
        </StackItem>

        {roles.length === 0 ? (
          <StackItem isFilled style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <EmptyStateFilter clearAllFilters={clearAllFilters} />
          </StackItem>
        ) : (
          <StackItem isFilled style={{ minHeight: 0, overflow: 'auto' }}>
            <ProjectRolesTable
              roles={roles}
              getSortParams={getSortParams}
              onEdit={setRoleToEdit}
              onDelete={deleteDialog.open}
            />
          </StackItem>
        )}

        <PaginationFooter
          page={page}
          perPage={perPage}
          total={rolesQuery.data?.total}
          hasNext={!!rolesQuery.data?.next}
          onPrev={goToPrevPage}
          onNext={() => goToNextPage(rolesQuery.data?.next ?? null)}
          onPerPageChange={handlePerPageChange}
        />
      </Stack>

      {isAddDialogOpen && (
        <AddProjectRoleDialog
          projectId={projectId}
          onClose={() => setIsAddDialogOpen(false)}
          onSuccess={handleRolesChanged}
        />
      )}

      {roleToEdit && (
        <EditProjectRoleDialog
          projectId={projectId}
          role={roleToEdit}
          onClose={() => setRoleToEdit(null)}
          onSuccess={handleRolesChanged}
        />
      )}

      <ConfirmationDialog
        isOpen={deleteDialog.isOpen}
        onClose={deleteDialog.close}
        onConfirm={() => handleDelete(deleteDialog.item)}
        title="Delete role?"
        confirmLabel="Delete"
        confirmVariant="danger"
        titleIconVariant="warning"
      >
        Permanently delete role <strong>{deleteDialog.item?.name}</strong>? Any assignments using this role will lose
        access.
      </ConfirmationDialog>
    </>
  )
}
