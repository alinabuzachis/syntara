import {
  Content,
  ContentVariants,
  Divider,
  MenuFooter,
  MenuToggle,
  Select,
  SelectList,
  SelectOption,
  Spinner,
  TextInputGroup,
  TextInputGroupMain,
} from '@patternfly/react-core'
import { PlusIcon } from '@patternfly/react-icons'
import { useCallback, useEffect, useState } from 'react'

import type { ProjectRead } from '../routes/access/types'
import { ProjectFormModal } from '../routes/access-management/ProjectFormModal'
import { useProjectStore } from '../stores/useProjectStore'
import { detachPromise } from '../utils/detachPromise'

import { PROJECT_SELECTOR_MAX_WIDTH, projectSelectorUx } from './projectSelectorUtils'
import { usePaginatedProjects } from './usePaginatedProjects'

const ALL_PROJECTS_VALUE = '__all__'
const CREATE_PROJECT_VALUE = '__create__'
const VIEW_MORE_VALUE = '__view_more__'

type UseProjectSelectorOptions = {
  /** When true, hides the "All projects" option and shows "Select a project" as placeholder. */
  requireProject?: boolean
}

type UseProjectSelectorResult = {
  selectedProject: ProjectRead | null
  isAllProjects: boolean
  projects: ProjectRead[]
  ProjectSelector: React.ReactNode
}

/**
 * Hook that provides a project selector dropdown and the currently selected project.
 * Uses server-side filtering with debounced typeahead and progressive "View more" loading.
 */
export function useProjectSelector(options?: UseProjectSelectorOptions): UseProjectSelectorResult {
  const { requireProject = false } = options ?? {}
  const { selectedProjectId, setSelectedProjectId } = useProjectStore()
  const [isOpen, setIsOpen] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  const {
    projects,
    filterValue,
    debouncedFilter,
    updateFilter,
    resetPagination,
    clearTypeaheadOnly,
    hasMore,
    isLoadingMore,
    isInitialPage,
    loadMore,
    query: projectsQuery,
  } = usePaginatedProjects()

  const selectedProject = selectedProjectId ? (projects.find((p) => p.id === selectedProjectId) ?? null) : null

  useEffect(() => {
    if (
      selectedProjectId &&
      isInitialPage &&
      projects.length > 0 &&
      !projects.some((p) => p.id === selectedProjectId)
    ) {
      setSelectedProjectId(null)
    }
  }, [selectedProjectId, projects, setSelectedProjectId, isInitialPage])

  const toggleLabel =
    selectedProject?.name ??
    (requireProject ? projectSelectorUx.selectProjectPlaceholder : projectSelectorUx.allProjectsOptionLabel)

  const noResults = projects.length === 0 && !!debouncedFilter && !projectsQuery.isPending

  const handleSelect = useCallback(
    (event: React.MouseEvent | undefined, value: string | number | undefined) => {
      if (value === CREATE_PROJECT_VALUE) {
        setIsOpen(false)
        setCreateDialogOpen(true)
        return
      }
      if (value === VIEW_MORE_VALUE) {
        event?.preventDefault()
        event?.stopPropagation()
        return
      }
      const projectId = typeof value === 'string' ? value : null
      if (projectId === ALL_PROJECTS_VALUE) {
        setSelectedProjectId(null)
        setIsOpen(false)
        resetPagination()
        return
      }
      setSelectedProjectId(projectId)
      setIsOpen(false)
      // Avoid resetPagination() here: it clears extraPages so page-2-only IDs vanish from `projects`
      // and the stale-selection effect clears the store. With no active filter, only clear typeahead text.
      if (debouncedFilter) {
        updateFilter('')
      } else {
        clearTypeaheadOnly()
      }
    },
    [setSelectedProjectId, resetPagination, debouncedFilter, updateFilter, clearTypeaheadOnly]
  )

  const ProjectSelector = (
    <>
      <Select
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        popperProps={{ maxWidth: PROJECT_SELECTOR_MAX_WIDTH }}
        onSelect={handleSelect}
        selected={selectedProjectId ?? (requireProject ? undefined : ALL_PROJECTS_VALUE)}
        toggle={(toggleRef) => (
          <MenuToggle ref={toggleRef} variant="typeahead" onClick={() => setIsOpen(!isOpen)} isExpanded={isOpen}>
            <TextInputGroup isPlain>
              <TextInputGroupMain
                value={isOpen ? filterValue : toggleLabel}
                onChange={(_e, val) => {
                  updateFilter(val)
                  if (!isOpen) setIsOpen(true)
                }}
                onClick={() => {
                  if (!isOpen) setIsOpen(true)
                }}
                placeholder={toggleLabel}
                autoComplete="off"
              />
            </TextInputGroup>
          </MenuToggle>
        )}
      >
        <SelectList style={{ maxHeight: '200px', overflow: 'auto' }}>
          {!requireProject && (
            <>
              <SelectOption
                key={ALL_PROJECTS_VALUE}
                value={ALL_PROJECTS_VALUE}
                description={projectSelectorUx.allProjectsOptionDescription}
              >
                {projectSelectorUx.allProjectsOptionLabel}
              </SelectOption>
              <Divider key="divider-all" />
            </>
          )}
          {noResults && (
            <SelectOption key="no-results" isAriaDisabled value="no-results">
              {`No results found for "${debouncedFilter}"`}
            </SelectOption>
          )}
          {projects.map((p) => (
            <SelectOption key={p.id} value={p.id} description={p.description?.trim() || undefined}>
              {p.name}
            </SelectOption>
          ))}
          {hasMore && (
            <SelectOption
              key={VIEW_MORE_VALUE}
              value={VIEW_MORE_VALUE}
              isLoadButton={!isLoadingMore}
              isLoading={isLoadingMore}
              onClick={loadMore}
            >
              {isLoadingMore ? <Spinner size="lg" /> : 'View more'}
            </SelectOption>
          )}
          <Divider key="divider-create" />
          <SelectOption key={CREATE_PROJECT_VALUE} value={CREATE_PROJECT_VALUE} icon={<PlusIcon />}>
            Create project
          </SelectOption>
        </SelectList>
        {hasMore && !noResults && (
          <MenuFooter>
            <Content component={ContentVariants.small}>Type to refine results</Content>
          </MenuFooter>
        )}
      </Select>

      <ProjectFormModal
        isOpen={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onSuccess={() => detachPromise(projectsQuery.refetch())}
        onCreated={(created) => {
          setCreateDialogOpen(false)
          setSelectedProjectId(created.id ?? null)
        }}
      />
    </>
  )

  return { selectedProject, isAllProjects: selectedProjectId === null, projects, ProjectSelector }
}
