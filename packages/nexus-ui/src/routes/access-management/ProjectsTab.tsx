import {
  Button,
  Flex,
  FlexItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Stack,
  StackItem,
} from '@patternfly/react-core'
import { PlusIcon, RhUiEditFillIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { IAction, ThProps } from '@patternfly/react-table'
import { useCallback, useState } from 'react'
import { navigate } from 'wouter/use-browser-location'

import { AppRoute } from '../../app/AppRoute'
import { useAlerts } from '../../components/alerts'
import { EmptyStateFilter } from '../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../components/EmptyStateNoData'
import { FilterBar } from '../../components/filters/FilterBar'
import { IconLabel } from '../../components/IconLabel'
import { useQueryState } from '../../components/states/useQueryState'
import type { FilterConfig, FilterFieldDefinition } from '../../types/filters'
import { FilterOperatorEnum, FilterTypeEnum } from '../../types/filters'
import { getErrorMessage } from '../../utils/apiErrors'
import { formatDateTime } from '../../utils/dateUtils'
import { detachPromise } from '../../utils/detachPromise'
import { accessClient } from '../access/accessClient'
import { PaginationFooter } from '../access/PaginationFooter'
import type { ProjectRead } from '../access/types'

import { ProjectFormModal } from './ProjectFormModal'

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
  onDelete: (p: ProjectRead) => void
): IAction[] {
  return [
    {
      title: <IconLabel icon={<RhUiEditFillIcon />}>Edit</IconLabel>,
      onClick: () => onEdit(project),
    },
    { isSeparator: true },
    {
      title: <IconLabel icon={<RhUiTrashIcon />}>Delete</IconLabel>,
      onClick: () => onDelete(project),
    },
  ]
}

function ProjectsTable({
  projects,
  getSortParams,
  onEdit,
  onDelete,
}: Readonly<{
  projects: ProjectRead[]
  getSortParams: (columnIndex: number) => ThProps['sort']
  onEdit: (p: ProjectRead) => void
  onDelete: (p: ProjectRead) => void
}>) {
  return (
    <Table aria-label="Projects" isStriped style={{ width: '100%' }}>
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
                onClick={() => navigate(AppRoute.AccessManagement.ProjectDetail.replace(':projectId', project.id))}
              >
                {project.name}
              </Button>
            </Td>
            <Td dataLabel="Description">{project.description ?? ''}</Td>
            <Td dataLabel="Created">{formatDateTime(project.created_at)}</Td>
            <Td dataLabel="Updated">{formatDateTime(project.updated_at)}</Td>
            <Td isActionCell>
              <ActionsColumn items={getRowActions(project, onEdit, onDelete)} />
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
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
    <Modal isOpen={isOpen} onClose={onClose} variant="small">
      <ModalHeader title="Delete project" />
      <ModalBody>Are you sure you want to delete &quot;{project?.name}&quot;? This action cannot be undone.</ModalBody>
      <ModalFooter>
        <Button variant="danger" onClick={onDelete}>
          Delete
        </Button>
        <Button variant="link" onClick={onClose}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}

export function ProjectsTab() {
  const [filters, setFilters] = useState<FilterConfig[]>([])
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [activeSortIndex, setActiveSortIndex] = useState<number | undefined>(undefined)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [projectToDelete, setProjectToDelete] = useState<ProjectRead | null>(null)
  const [projectToEdit, setProjectToEdit] = useState<ProjectRead | null>(null)
  const [formModalOpen, setFormModalOpen] = useState(false)
  const { showAlert } = useAlerts()
  const hasActiveFilters = filters.length > 0

  const handleFilterChange = (newFilters: FilterConfig[]) => {
    setFilters(newFilters)
    setPage(1)
  }

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage)
    setPage(1)
  }

  const getSortParams = useCallback(
    (columnIndex: number): ThProps['sort'] => ({
      sortBy: {
        index: activeSortIndex,
        direction: sortDirection,
        defaultDirection: 'asc',
      },
      onSort: (_event, index, direction) => {
        setActiveSortIndex(index)
        setSortDirection(direction as 'asc' | 'desc')
        setPage(1)
      },
      columnIndex,
    }),
    [activeSortIndex, sortDirection]
  )

  // The projects endpoint returns a flat array (not paginated), so we handle
  // client-side filtering and pagination for now.
  const query = accessClient.useQuery('get', '/projects')
  const allProjects = query.data ?? []

  // Client-side filtering
  const filteredProjects = allProjects.filter((project) =>
    filters.every((filter) => {
      const value = project[filter.key as keyof ProjectRead]
      if (typeof value !== 'string') return true
      return value.toLowerCase().includes(String(filter.value).toLowerCase())
    })
  )

  // Client-side sorting — only string fields are sortable
  const sortFieldByColumn: Record<number, 'name' | 'created_at' | 'updated_at'> = {
    0: 'name',
    2: 'created_at',
    3: 'updated_at',
  }

  const sortedProjects = [...filteredProjects].sort((a, b) => {
    if (activeSortIndex === undefined) return 0
    const field = sortFieldByColumn[activeSortIndex]
    if (!field) return 0
    const aVal = a[field] ?? ''
    const bVal = b[field] ?? ''
    const cmp = aVal.localeCompare(bVal)
    return sortDirection === 'desc' ? -cmp : cmp
  })

  // Client-side pagination
  const startIndex = (page - 1) * perPage
  const paginatedProjects = sortedProjects.slice(startIndex, startIndex + perPage)
  const hasNext = startIndex + perPage < sortedProjects.length

  const { mutate: deleteProject } = accessClient.useMutation('delete', '/projects/{project_id}')

  const handleDelete = () => {
    if (!projectToDelete) return
    deleteProject(
      { params: { path: { project_id: projectToDelete.id } } },
      {
        onSuccess: () => {
          showAlert({
            title: 'Project deleted',
            description: `Project "${projectToDelete.name}" has been deleted successfully.`,
            variant: 'success',
            autoDismiss: true,
          })
          query.refetch().catch(() => {})
        },
        onError: (error: unknown) => {
          showAlert({
            title: 'Delete failed',
            description: `Failed to delete project "${projectToDelete.name}": ${getErrorMessage(error)}`,
            variant: 'error',
            autoDismiss: true,
          })
        },
        onSettled: () => setProjectToDelete(null),
      }
    )
  }

  const queryState = useQueryState(query, {
    title: 'Error loading projects',
    onRetry: () => detachPromise(query.refetch()),
  })
  if (queryState) return queryState

  if (allProjects.length === 0 && !hasActiveFilters) {
    return (
      <>
        <EmptyStateNoData
          title="No projects"
          description="Create a project to organize automations and manage access."
          buttonText="Add project"
          addData={() => setFormModalOpen(true)}
        />
        <ProjectFormModal
          project={null}
          isOpen={formModalOpen}
          onClose={() => {
            setFormModalOpen(false)
          }}
          onSuccess={() => {
            query.refetch().catch(() => {})
          }}
        />
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
                fieldDefinitions={filterFieldDefinitions}
                filters={filters}
                onFilterChange={handleFilterChange}
                showClearAll={true}
                clearAllFilters={() => handleFilterChange([])}
              />
            </FlexItem>
            <FlexItem>
              <Button variant="primary" icon={<PlusIcon />} onClick={() => setFormModalOpen(true)}>
                Add project
              </Button>
            </FlexItem>
          </Flex>
        </StackItem>
        {paginatedProjects.length === 0 ? (
          <StackItem isFilled style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <EmptyStateFilter clearAllFilters={() => handleFilterChange([])} />
          </StackItem>
        ) : (
          <StackItem isFilled style={{ minHeight: 0, overflow: 'auto' }}>
            <ProjectsTable
              projects={paginatedProjects}
              getSortParams={getSortParams}
              onEdit={(p) => {
                setProjectToEdit(p)
                setFormModalOpen(true)
              }}
              onDelete={setProjectToDelete}
            />
          </StackItem>
        )}
        <PaginationFooter
          page={page}
          perPage={perPage}
          total={sortedProjects.length}
          hasNext={hasNext}
          onPrev={() => {
            setPage(Math.max(1, page - 1))
          }}
          onNext={() => {
            setPage(page + 1)
          }}
          onPerPageChange={handlePerPageChange}
        />
      </Stack>

      <ProjectFormModal
        project={projectToEdit}
        isOpen={formModalOpen}
        onClose={() => {
          setFormModalOpen(false)
          setProjectToEdit(null)
        }}
        onSuccess={() => {
          query.refetch().catch(() => {})
        }}
      />

      <DeleteProjectDialog
        project={projectToDelete}
        isOpen={!!projectToDelete}
        onClose={() => setProjectToDelete(null)}
        onDelete={handleDelete}
      />
    </>
  )
}
