import {
  Button,
  Divider,
  Form,
  FormGroup,
  MenuToggle,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Select,
  SelectList,
  SelectOption,
  TextInput,
} from '@patternfly/react-core'
import { PlusIcon } from '@patternfly/react-icons'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'

import { useAlerts } from '../components/alerts'
import { accessClient } from '../routes/access/accessClient'
import type { ProjectCreate, ProjectRead } from '../routes/access/types'
import { useProjectStore } from '../stores/useProjectStore'
import { getErrorMessage } from '../utils/apiErrors'

const ALL_PROJECTS_VALUE = '__all__'
const CREATE_PROJECT_VALUE = '__create__'

interface UseProjectSelectorOptions {
  /** When true, hides the "All projects" option and shows "Select a project" as placeholder. */
  requireProject?: boolean
}

interface UseProjectSelectorResult {
  selectedProject: ProjectRead | null
  isAllProjects: boolean
  projects: ProjectRead[]
  ProjectSelector: React.ReactNode
}

/**
 * Hook that provides a project selector dropdown and the currently selected project.
 * When "All projects" is selected, selectedProject is null and no project_id filter is applied.
 * Selection persists across page navigation via Zustand store with localStorage.
 *
 * When `requireProject` is true, the "All projects" option is hidden and the toggle shows
 * "Select a project" when nothing is selected.
 *
 * Includes a "Create project" option in the dropdown that opens a modal dialog.
 */
export function useProjectSelector(options?: UseProjectSelectorOptions): UseProjectSelectorResult {
  const { requireProject = false } = options ?? {}
  const { selectedProjectId, setSelectedProjectId } = useProjectStore()
  const [isOpen, setIsOpen] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const { showSuccess, showError } = useAlerts()

  const projectsQuery = accessClient.useQuery('get', '/projects')
  const projects = projectsQuery.data ?? []
  const selectedProject = selectedProjectId ? (projects.find((p) => p.id === selectedProjectId) ?? null) : null

  // Clear stale project ID if it doesn't match any known project
  const projectsData = projectsQuery.data
  useEffect(() => {
    if (
      selectedProjectId &&
      projectsData &&
      projectsData.length > 0 &&
      !projectsData.some((p) => p.id === selectedProjectId)
    ) {
      setSelectedProjectId(null)
    }
  }, [selectedProjectId, projectsData, setSelectedProjectId])

  const { mutate: createProject, isPending: isCreatingProject } = accessClient.useMutation('post', '/projects')
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProjectCreate>()

  const handleCreateProject = (data: ProjectCreate) => {
    createProject(
      { body: data },
      {
        onSuccess: (created) => {
          showSuccess(`Project "${created.name}" created`, 'Project Created')
          reset()
          setCreateDialogOpen(false)
          projectsQuery.refetch().catch(() => {})
          setSelectedProjectId(created.id)
        },
        onError: (error: unknown) => {
          showError(getErrorMessage(error), 'Failed to Create Project')
        },
      }
    )
  }

  const toggleLabel = selectedProject?.name ?? (requireProject ? 'Select a project' : 'All projects')

  const ProjectSelector = (
    <>
      <Select
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        onSelect={(_event, value) => {
          if (value === CREATE_PROJECT_VALUE) {
            setIsOpen(false)
            setCreateDialogOpen(true)
            return
          }
          setSelectedProjectId(value === ALL_PROJECTS_VALUE ? null : (value as string))
          setIsOpen(false)
        }}
        selected={selectedProjectId ?? (requireProject ? undefined : ALL_PROJECTS_VALUE)}
        toggle={(toggleRef) => (
          <MenuToggle ref={toggleRef} onClick={() => setIsOpen(!isOpen)} isExpanded={isOpen}>
            {toggleLabel}
          </MenuToggle>
        )}
      >
        <SelectList>
          {!requireProject && (
            <>
              <SelectOption key={ALL_PROJECTS_VALUE} value={ALL_PROJECTS_VALUE}>
                All projects
              </SelectOption>
              <Divider key="divider-all" />
            </>
          )}
          {projects.map((p) => (
            <SelectOption key={p.id} value={p.id}>
              {p.name}
            </SelectOption>
          ))}
          <Divider key="divider-create" />
          <SelectOption key={CREATE_PROJECT_VALUE} value={CREATE_PROJECT_VALUE} icon={<PlusIcon />}>
            Create project
          </SelectOption>
        </SelectList>
      </Select>

      <Modal
        isOpen={createDialogOpen}
        onClose={() => {
          setCreateDialogOpen(false)
          reset()
        }}
        variant="small"
      >
        <ModalHeader title="Create project" />
        <ModalBody>
          <Form id="create-project-form" onSubmit={handleSubmit(handleCreateProject)}>
            <FormGroup label="Name" isRequired fieldId="project-name">
              <TextInput
                id="project-name"
                isRequired
                aria-label="Project name"
                validated={errors.name ? 'error' : 'default'}
                {...register('name', { required: true })}
              />
            </FormGroup>
            <FormGroup label="Description" fieldId="project-description">
              <TextInput
                id="project-description"
                aria-label="Project description"
                validated="default"
                {...register('description')}
              />
            </FormGroup>
          </Form>
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" form="create-project-form" type="submit" isLoading={isCreatingProject}>
            Create
          </Button>
          <Button
            variant="link"
            onClick={() => {
              setCreateDialogOpen(false)
              reset()
            }}
          >
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </>
  )

  return { selectedProject, isAllProjects: selectedProjectId === null, projects, ProjectSelector }
}
