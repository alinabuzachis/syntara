import { Button, Content, List, ListItem, Stack, StackItem, Truncate } from '@patternfly/react-core'
import { RhUiAddIcon, RhUiEditFillIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { ActionsColumn, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { IAction, ThProps } from '@patternfly/react-table'
import { useCallback, useMemo, useState } from 'react'

import { AppRoute } from '../../app/AppRoute'
import { NxConfirmationDialog } from '../../components/dialogs/NxConfirmationDialog'
import { DisabledWithTooltip } from '../../components/DisabledWithTooltip'
import { IconLabel } from '../../components/IconLabel'
import { NxListPanelTable, NxListPanelToolbar, NxListPanelView } from '../../components/panels/list/NxListPanel'
import { NxEmptyStateNoData } from '../../components/states/NxEmptyStateNoData'
import { navigate } from '../../hooks/routing/navigate'
import { useDialogState } from '../../hooks/useDialogState'
import { useFilterState } from '../../hooks/useFilterState'
import { useSortState } from '../../hooks/useSortState'
import { useAlerts } from '../../providers/alerts'
import type { FilterFieldDefinition } from '../../types/filters'
import { FilterOperatorEnum, FilterTypeEnum } from '../../types/filters'
import { getErrorMessage } from '../../utils/apiErrors'
import { formatDateTime } from '../../utils/dateUtils'
import { detachPromise } from '../../utils/detachPromise'
import { accessClient } from '../access/accessClient'
import type { ProjectRead } from '../access/types'
import { useAllProjects } from '../access/useAllProjects'

import { ProjectFormModal } from './ProjectFormModal'
import { useProjectPermissions } from './useProjectPermissions'

const filterFieldDefinitions: FilterFieldDefinition[] = [
  {
    key: 'name',
    label: 'Name',
    type: FilterTypeEnum.TEXT,
    operators: [FilterOperatorEnum.CONTAINS],
    defaultOperator: FilterOperatorEnum.CONTAINS,
    placeholder: 'Filter by name',
  },
  {
    key: 'description',
    label: 'Description',
    type: FilterTypeEnum.TEXT,
    operators: [FilterOperatorEnum.CONTAINS],
    defaultOperator: FilterOperatorEnum.CONTAINS,
    placeholder: 'Filter by description',
  },
]

function getRowActions(
  project: ProjectRead,
  onEdit: (p: ProjectRead) => void,
  onDelete: (p: ProjectRead) => void,
  permissions: ReturnType<typeof useProjectPermissions>
): IAction[] {
  return [
    {
      title: <IconLabel icon={<RhUiEditFillIcon />}>Edit</IconLabel>,
      isAriaDisabled: !permissions.canUpdate,
      tooltipProps: permissions.canUpdate ? undefined : { content: permissions.tooltips.update },
      onClick: permissions.canUpdate ? () => onEdit(project) : undefined,
    },
    { isSeparator: true },
    {
      title: <IconLabel icon={<RhUiTrashIcon />}>Delete</IconLabel>,
      isAriaDisabled: !permissions.canDelete,
      tooltipProps: permissions.canDelete ? undefined : { content: permissions.tooltips.delete },
      onClick: permissions.canDelete ? () => onDelete(project) : undefined,
    },
  ]
}

function ProjectsTable({
  projects,
  getSortParams,
  onEdit,
  onDelete,
  permissions,
}: Readonly<{
  projects: ProjectRead[]
  getSortParams: (columnIndex: number) => ThProps['sort']
  onEdit: (p: ProjectRead) => void
  onDelete: (p: ProjectRead) => void
  permissions: ReturnType<typeof useProjectPermissions>
}>) {
  return (
    <>
      <Thead>
        <Tr>
          <Th sort={getSortParams(0)}>Name</Th>
          <Th>Description</Th>
          <Th sort={getSortParams(2)}>Created</Th>
          <Th sort={getSortParams(3)}>Updated</Th>
          <Th screenReaderText="Actions" />
        </Tr>
      </Thead>
      <Tbody>
        {projects.map((project) => (
          <Tr key={project.id}>
            <Td dataLabel="Name">
              <Button
                variant="link"
                isInline
                onClick={() =>
                  navigate(AppRoute.AccessManagement.ProjectDetail.replace(':projectId', project.id ?? ''))
                }
              >
                <Truncate content={project.name ?? ''} />
              </Button>
            </Td>
            <Td dataLabel="Description">
              <Truncate content={project.description ?? ''} />
            </Td>
            <Td dataLabel="Created">{formatDateTime(project.created_at)}</Td>
            <Td dataLabel="Updated">{formatDateTime(project.updated_at)}</Td>
            <Td isActionCell>
              <ActionsColumn items={getRowActions(project, onEdit, onDelete, permissions)} />
            </Td>
          </Tr>
        ))}
      </Tbody>
    </>
  )
}

function DeleteProjectDialog({
  project,
  isOpen,
  onClose,
  onDelete,
}: Readonly<{
  project: ProjectRead | null
  isOpen: boolean
  onClose: () => void
  onDelete: () => void
}>) {
  return (
    <NxConfirmationDialog
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onDelete}
      title="Delete project?"
      confirmLabel="Delete"
      confirmVariant="danger"
      titleIconVariant="warning"
      destructiveAcknowledgement={{
        checkboxId: 'delete-project-ack',
        label: 'I understand this project, its workflows, and role assignments will be permanently deleted or removed.',
      }}
    >
      <Stack hasGutter>
        <StackItem>
          The project <strong>{project?.name}</strong> will be deleted. This cannot be undone.
        </StackItem>
        <StackItem>
          <List>
            <ListItem>All workflows in this project will be permanently deleted.</ListItem>
            <ListItem>All project role assignments will be removed.</ListItem>
          </List>
        </StackItem>
      </Stack>
    </NxConfirmationDialog>
  )
}

const projectSortFieldByColumn: Record<number, string> = {
  0: 'name',
  2: 'created_at',
  3: 'updated_at',
}

export function ProjectsTab() {
  const permissions = useProjectPermissions()
  const { filters, setAllFilters, clearAllFilters } = useFilterState()
  const { activeSortIndex, sortDirection, getSortParams } = useSortState(projectSortFieldByColumn)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const handlePerPageChange = useCallback((newPerPage: number) => {
    setPerPage(newPerPage)
    setPage(1)
  }, [])
  const deleteDialog = useDialogState<ProjectRead>()
  const formDialog = useDialogState<ProjectRead | null>()
  const { showAlert } = useAlerts()
  const hasActiveFilters = filters.length > 0

  const handleFilterChange = (newFilters: typeof filters) => {
    setAllFilters(newFilters)
    setPage(1)
  }

  const handleClearAllFilters = useCallback(() => {
    clearAllFilters()
    setPage(1)
  }, [clearAllFilters])

  const { projects: allProjects, isLoading, error, refetch } = useAllProjects()

  const { sortedProjects, paginatedProjects, hasNext } = useMemo(() => {
    const filtered = allProjects.filter((project) =>
      filters.every((filter) => {
        const value = project[filter.key as keyof ProjectRead]
        if (typeof value !== 'string') return true
        return value.toLowerCase().includes(String(filter.value).toLowerCase())
      })
    )

    const sorted = [...filtered].sort((a, b) => {
      if (activeSortIndex === undefined) return 0
      const field = projectSortFieldByColumn[activeSortIndex] as 'name' | 'created_at' | 'updated_at' | undefined
      if (!field) return 0
      const aVal = a[field] ?? ''
      const bVal = b[field] ?? ''
      const cmp = aVal.localeCompare(bVal)
      return sortDirection === 'desc' ? -cmp : cmp
    })

    const startIndex = (page - 1) * perPage
    return {
      sortedProjects: sorted,
      paginatedProjects: sorted.slice(startIndex, startIndex + perPage),
      hasNext: startIndex + perPage < sorted.length,
    }
  }, [allProjects, filters, activeSortIndex, sortDirection, page, perPage])

  const { mutate: deleteProject } = accessClient.useMutation('delete', '/projects/{project_id}')

  const handleDelete = () => {
    const project = deleteDialog.item
    if (!project) return
    deleteProject(
      { params: { path: { project_id: project.id ?? '' } } },
      {
        onSuccess: () => {
          showAlert({
            title: 'Project deleted',
            description: `Project "${project.name}" has been deleted successfully.`,
            variant: 'success',
            autoDismiss: true,
          })
          detachPromise(refetch())
        },
        onError: (error: unknown) => {
          showAlert({
            title: 'Delete failed',
            description: `Failed to delete project "${project.name}": ${getErrorMessage(error)}`,
            variant: 'error',
            autoDismiss: true,
          })
        },
        onSettled: () => {
          deleteDialog.close()
        },
      }
    )
  }

  return (
    <>
      <NxListPanelView
        tabKey="projects"
        tabLabel="Projects"
        isPending={isLoading}
        error={error}
        onRetry={() => detachPromise(refetch())}
        isEmpty={sortedProjects.length === 0}
        hasActiveFilters={hasActiveFilters}
        onClearAllFilters={handleClearAllFilters}
        noDataState={
          <NxEmptyStateNoData
            title="No projects yet"
            description="Create a project to organize workflows and manage access."
            buttonText="Create project"
            addData={permissions.canCreate ? () => formDialog.open(null) : undefined}
          />
        }
        toolbar={
          sortedProjects.length > 0 || hasActiveFilters ? (
            <NxListPanelToolbar
              filters={filters}
              filterDefinitions={filterFieldDefinitions}
              onFilterChange={handleFilterChange}
              clearAllFilters={handleClearAllFilters}
              actions={
                <DisabledWithTooltip isDisabled={!permissions.canCreate} content={permissions.tooltips.create}>
                  <Button
                    variant="primary"
                    icon={<RhUiAddIcon />}
                    isAriaDisabled={!permissions.canCreate}
                    onClick={permissions.canCreate ? () => formDialog.open(null) : undefined}
                  >
                    Create project
                  </Button>
                </DisabledWithTooltip>
              }
            />
          ) : undefined
        }
        body={
          <>
            <Content>
              Projects organize workflows and their resources, such as credentials, into separate workspaces. Each
              workflow and credential belongs to exactly one project. Use projects to keep related automation work
              together and to control access through role assignments.
            </Content>
            <NxListPanelTable
              caption="Projects"
              footer={{
                page,
                perPage,
                total: sortedProjects.length,
                hasNext,
                onPrev: () => setPage(Math.max(1, page - 1)),
                onNext: () => setPage(page + 1),
                onPerPageChange: handlePerPageChange,
              }}
            >
              <ProjectsTable
                projects={paginatedProjects}
                getSortParams={getSortParams}
                permissions={permissions}
                onEdit={(p) => formDialog.open(p)}
                onDelete={(p) => deleteDialog.open(p)}
              />
            </NxListPanelTable>
          </>
        }
      />

      <ProjectFormModal
        project={formDialog.item}
        isOpen={formDialog.isOpen}
        onClose={formDialog.close}
        onSuccess={() => {
          detachPromise(refetch())
        }}
      />

      <DeleteProjectDialog
        project={deleteDialog.item}
        isOpen={deleteDialog.isOpen}
        onClose={deleteDialog.close}
        onDelete={handleDelete}
      />
    </>
  )
}
