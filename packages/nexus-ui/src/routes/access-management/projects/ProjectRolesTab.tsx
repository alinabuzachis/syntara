import { Button, Label, LabelGroup, Flex, FlexItem, StackItem } from '@patternfly/react-core'
import { PlusIcon, RhUiEditFillIcon, RhUiLockIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { ActionsColumn, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { IAction, ThProps } from '@patternfly/react-table'
import { useState } from 'react'

import { AppPageMain } from '../../../app/AppPage'
import { useAlerts } from '../../../components/alerts'
import { ConfirmationDialog } from '../../../components/ConfirmationDialog'
import { EmptyStateFilter } from '../../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../../components/EmptyStateNoData'
import { FilterBar } from '../../../components/filters'
import { IconLabel } from '../../../components/IconLabel'
import { PanelContentStack } from '../../../components/PanelContentStack'
import { useQueryState } from '../../../components/states/useQueryState'
import { ScrollableTableContainer } from '../../../components/table/ScrollableTableContainer'
import { useDialogState } from '../../../hooks/useDialogState'
import { getErrorMessage } from '../../../utils/apiErrors'
import { detachPromise } from '../../../utils/detachPromise'
import { accessClient } from '../../access/accessClient'
import { builtinFilterDefinitions } from '../../access/builtinFilterDefinitions'
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
    <>
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
                <Label color="grey" icon={<RhUiLockIcon />} isCompact>
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
    </>
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
          showSuccess({ title: 'Role deleted', description: `Deleted role "${role.name}"` })
          handleRolesChanged()
        },
        onError: (error) => {
          showError({ title: 'Failed to delete role', description: getErrorMessage(error) })
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
      <PanelContentStack>
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
          <AppPageMain isCentered>
            <EmptyStateFilter clearAllFilters={clearAllFilters} />
          </AppPageMain>
        ) : (
          <ScrollableTableContainer
            aria-label="Project roles"
            useFixedLayout={false}
            footer={{
              content: (
                <>
                  {roles.length} {roles.length === 1 ? 'role' : 'roles'}
                  {rolesQuery.data?.total != null && rolesQuery.data.total > roles.length && (
                    <> of {rolesQuery.data.total}</>
                  )}
                </>
              ),
              prev: page > 1 ? 'prev' : null,
              next: rolesQuery.data?.next ?? null,
              onPrev: goToPrevPage,
              onNext: () => goToNextPage(rolesQuery.data?.next ?? null),
            }}
          >
            <ProjectRolesTable
              roles={roles}
              getSortParams={getSortParams}
              onEdit={setRoleToEdit}
              onDelete={deleteDialog.open}
            />
          </ScrollableTableContainer>
        )}
      </PanelContentStack>

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
