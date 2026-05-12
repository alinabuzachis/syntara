import {
  Button,
  Content,
  ContentVariants,
  Divider,
  MenuFooter,
  MenuToggle,
  Select,
  SelectGroup,
  SelectList,
  SelectOption,
  Spinner,
  TextInputGroup,
  TextInputGroupMain,
  TextInputGroupUtilities,
  Tooltip,
} from '@patternfly/react-core'
import { RhUiAddIcon, TimesIcon } from '@patternfly/react-icons'
import { useCallback, useEffect, useMemo, useState } from 'react'

import type { ProjectRead } from '../routes/access/types'
import { ProjectFormModal } from '../routes/access-management/ProjectFormModal'
import { useProjectStore } from '../stores/useProjectStore'
import { detachPromise } from '../utils/detachPromise'

import { PROJECT_SELECTOR_LIST_MAX_HEIGHT, PROJECT_SELECTOR_WIDTH, projectSelectorUx } from './projectSelectorUtils'
import { usePaginatedProjects } from './usePaginatedProjects'

function resolveMenuToggleStatus(
  requireProject: boolean,
  hasValidationError: boolean,
  selectedProjectId: string | null
): 'danger' | undefined {
  if (requireProject && hasValidationError && !selectedProjectId) return 'danger'
  return undefined
}

function resolveToggleLabel(selectedProjectName: string | undefined, requireProject: boolean): string {
  if (selectedProjectName) return selectedProjectName
  return requireProject ? projectSelectorUx.selectProjectPlaceholder : projectSelectorUx.allProjectsOptionLabel
}

/**
 * Returns the name to show in the toggle, using `storedName` as a fallback when
 * the selected project is temporarily absent from the typeahead results (e.g. a
 * no-match filter was dismissed before the unfiltered list re-fetched).
 * Returns `undefined` when no project is selected so `resolveToggleLabel` shows
 * the placeholder text.
 */
function resolveDisplayName(
  selectedName: string | undefined,
  projectId: string | null,
  storedName: string | null
): string | undefined {
  return selectedName ?? (projectId ? (storedName ?? undefined) : undefined)
}

/**
 * Handles the favorite-star action on a project row. Extracted to module scope to keep
 * `useProjectSelector` under the cyclomatic-complexity limit.
 */
function onFavoriteAction(
  toggleFn: (id: string) => void,
  event: React.MouseEvent | undefined,
  itemId: string | number | undefined,
  actionId?: string | number
): void {
  if (actionId !== 'fav' || typeof itemId !== 'string' || NON_PROJECT_VALUES.has(itemId)) return
  event?.stopPropagation()
  toggleFn(itemId)
}

const ALL_PROJECTS_VALUE = '__all__'
const CREATE_PROJECT_VALUE = '__create__'
const VIEW_MORE_VALUE = '__view_more__'

type UseProjectSelectorOptions = {
  /** When true, hides the "All projects" option and shows "Select a project" as placeholder. */
  requireProject?: boolean
  /** Server-provided project ID to seed into the store on mount. User selections take precedence afterward. */
  initialProjectId?: string | null
  /**
   * When true with `requireProject` and no project selected in the store, applies `MenuToggle`
   * danger styling so the selector surfaces a validation failure (e.g. save attempted without project).
   */
  hasValidationError?: boolean
  /**
   * Called when the user explicitly selects a project from the dropdown. Use this to clear
   * any validation error state set by the caller (e.g. reset `saveAttemptedWithoutProject`).
   */
  onProjectSelect?: (project: ProjectRead | null) => void
}

type UseProjectSelectorResult = {
  selectedProject: ProjectRead | null
  /**
   * The raw Zustand-persisted project ID. Unlike `selectedProject`, this never
   * becomes null just because the project is absent from the current typeahead
   * filter results. Consumers that gate API queries on the selected project should
   * use this as a stable fallback (e.g. `selectedProject?.id ?? selectedProjectId`).
   */
  selectedProjectId: string | null
  /**
   * A stable `project_id` for API queries: `selectedProject?.id` when the project
   * is visible in the list, falling back to the raw Zustand store ID when the user
   * is typing a filter (so the project temporarily disappears from the list).
   * `undefined` when "All projects" is selected or no project is selected.
   */
  stableProjectId: string | undefined
  isAllProjects: boolean
  projects: ProjectRead[]
  ProjectSelector: React.ReactNode
}

/**
 * Hook that provides a project selector dropdown and the currently selected project.
 * Uses server-side filtering with debounced typeahead and progressive "View more" loading.
 * When "All projects" is selected, selectedProject is null and no project_id filter is applied.
 * Selection persists across page navigation via Zustand store with localStorage.
 *
 * When `requireProject` is true, the "All projects" option is hidden and the toggle shows
 * `projectSelectorUx.selectProjectPlaceholder` when nothing is selected.
 *
 * When `hasValidationError` is true with `requireProject` and no project selected, the typeahead
 * `MenuToggle` uses `status="danger"`.
 *
 * Includes a "Create project" option in the dropdown that opens a modal dialog.
 *
 * Project rows use PatternFly Select favorites (`isFavorited` + `onActionClick` for `fav`).
 * Favorite IDs persist in `useProjectStore`. Favorites appear in a **Favorites** group (quick access)
 * and again in **Projects** with the full current list (PatternFly favorites pattern).
 */
function favoriteProjectsInResults(projects: ProjectRead[], favoriteProjectIds: readonly string[]): ProjectRead[] {
  const byId = new Map(projects.filter((p) => p.id).map((p) => [p.id!, p]))
  return favoriteProjectIds.map((id) => byId.get(id)).filter((p): p is ProjectRead => p !== undefined)
}

/** IDs that represent actions/meta-items — not real projects, never favoritable. */
const NON_PROJECT_VALUES = new Set([ALL_PROJECTS_VALUE, CREATE_PROJECT_VALUE, VIEW_MORE_VALUE])

const descriptionStyle: React.CSSProperties = {
  display: 'block',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '100%',
}

function renderProjectOption(p: ProjectRead, reactKeyPrefix: string, favoriteProjectIdSet: Set<string>) {
  const projectId = p.id ?? ''
  const trimmedDescription = p.description?.trim() || undefined
  const description = trimmedDescription ? <span style={descriptionStyle}>{trimmedDescription}</span> : undefined
  return (
    <SelectOption
      key={`${reactKeyPrefix}-${projectId}`}
      value={projectId}
      description={description}
      isFavorited={projectId !== '' && favoriteProjectIdSet.has(projectId)}
    >
      {p.name}
    </SelectOption>
  )
}

type ProjectGroupsArgs = {
  projects: ProjectRead[]
  favoriteProjectsOrdered: ProjectRead[]
  favoriteProjectIdSet: Set<string>
  hasMore: boolean
  isLoadingMore: boolean
  loadMore: () => void
}

/**
 * Returns the Favorites + Projects `SelectGroup` JSX for the scrollable list.
 * Lowercase function (not a component) so the file remains hook-only for react-refresh.
 * Extracted here to keep `useProjectSelector` under the cyclomatic-complexity limit.
 */
function renderProjectGroups({
  projects,
  favoriteProjectsOrdered,
  favoriteProjectIdSet,
  hasMore,
  isLoadingMore,
  loadMore,
}: ProjectGroupsArgs) {
  const hasFavorites = favoriteProjectsOrdered.length > 0
  const hasProjects = projects.length > 0 || hasMore
  return (
    <>
      {hasFavorites && (
        <SelectGroup key="group-favorites" label={projectSelectorUx.favoritesGroupLabel} labelHeadingLevel="h2">
          {favoriteProjectsOrdered.map((p) => renderProjectOption(p, 'fav', favoriteProjectIdSet))}
        </SelectGroup>
      )}
      {hasFavorites && hasProjects && <Divider key="divider-favorites-projects" />}
      {hasProjects && (
        <SelectGroup key="group-projects" label={projectSelectorUx.projectsGroupLabel} labelHeadingLevel="h2">
          {projects.map((p) => renderProjectOption(p, 'proj', favoriteProjectIdSet))}
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
        </SelectGroup>
      )}
    </>
  )
}

type FilteredContentArgs = ProjectGroupsArgs & {
  noResults: boolean
  debouncedFilter: string
}

/**
 * Renders the scrollable list body: "no results" message, or project groups.
 * Extracted to keep `useProjectSelector`'s cyclomatic complexity within limits.
 * The loading state is shown in the toggle's input utilities area (not here) so that
 * `SelectOption` elements are never unmounted during a filter fetch — which would cause
 * PatternFly to replay the favorite-star CSS animation on every keystroke.
 */
function renderFilteredContent({ noResults, debouncedFilter, ...groupArgs }: FilteredContentArgs) {
  if (noResults) {
    return (
      <SelectOption key="no-results" isAriaDisabled value="no-results">
        {`No results found for "${debouncedFilter}"`}
      </SelectOption>
    )
  }
  return renderProjectGroups(groupArgs)
}

/**
 * Renders the right-side utilities area of the typeahead input.
 * The container is always mounted while the dropdown is open so the input field width
 * stays stable — appearing/disappearing utilities causes a layout flash on the first keystroke.
 * The spinner and × button coexist so the × never disappears mid-fetch.
 * Keeping loading feedback here (not in the dropdown list) prevents `SelectOption` elements
 * from unmounting, which would replay PatternFly's favorite-star CSS animation.
 */
function renderInputUtilities(isOpen: boolean, filterValue: string, isFilterFetching: boolean, onClear: () => void) {
  // Always render so the toggle layout is stable — returning null when closed causes
  // the input area to widen/narrow as the utilities appear, which looks like a "shrink".
  return (
    <TextInputGroupUtilities style={{ visibility: isOpen ? undefined : 'hidden' }}>
      {isFilterFetching && <Spinner size="sm" aria-label="Filtering projects" />}
      {/* Reserve button space so the input width never shifts during filtering. */}
      <Button
        variant="plain"
        aria-label="Clear filter"
        onClick={onClear}
        style={{ visibility: filterValue ? 'visible' : 'hidden' }}
        tabIndex={filterValue && isOpen ? 0 : -1}
      >
        <TimesIcon aria-hidden />
      </Button>
    </TextInputGroupUtilities>
  )
}

export function useProjectSelector(options?: UseProjectSelectorOptions): UseProjectSelectorResult {
  const { requireProject = false, initialProjectId, hasValidationError = false, onProjectSelect } = options ?? {}
  const { selectedProjectId, setSelectedProjectId, favoriteProjectIds, toggleFavoriteProjectId } = useProjectStore()
  const menuToggleStatus = resolveMenuToggleStatus(requireProject, hasValidationError, selectedProjectId)
  const [isOpen, setIsOpen] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [isToggleHovered, setIsToggleHovered] = useState(false)

  useEffect(() => {
    if (initialProjectId) setSelectedProjectId(initialProjectId)
  }, [initialProjectId, setSelectedProjectId])

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

  const favoriteProjectsOrdered = useMemo(
    () => favoriteProjectsInResults(projects, favoriteProjectIds),
    [projects, favoriteProjectIds]
  )

  const selectedProject = useMemo(
    () => (selectedProjectId ? (projects.find((p) => p.id === selectedProjectId) ?? null) : null),
    [selectedProjectId, projects]
  )

  // Clear stale selections that no longer exist in the project list.
  // Skip when initialProjectId is set — it's a trusted server value that
  // may not yet appear in the paginated first page.
  useEffect(() => {
    if (
      !initialProjectId &&
      selectedProjectId &&
      isInitialPage &&
      !projectsQuery.isFetching &&
      projects.length > 0 &&
      !projects.some((p) => p.id === selectedProjectId)
    ) {
      setSelectedProjectId(null)
    }
  }, [initialProjectId, selectedProjectId, projects, setSelectedProjectId, isInitialPage, projectsQuery.isFetching])

  // When the selected project is filtered out of the visible list, fall back to the
  // store-persisted name so the toggle never flashes "All projects" during the
  // debounce + re-fetch window that follows dismissing a no-match filter.
  // syncName is also used in the effect below to keep the store current for initialProjectId cases.
  const { selectedProjectName: storedProjectName, setSelectedProjectName: syncName } = useProjectStore()
  useEffect(() => {
    if (selectedProject?.name) syncName(selectedProject.name)
  }, [selectedProject, syncName])
  const name = resolveDisplayName(selectedProject?.name, selectedProjectId, storedProjectName)
  const toggleLabel = resolveToggleLabel(name, requireProject)
  const isFilterFetching = !!debouncedFilter && projectsQuery.isFetching
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
      const selected = projectId ? (projects.find((p) => p.id === projectId) ?? null) : null
      setSelectedProjectId(projectId, selected?.name ?? null)
      setIsOpen(false)
      // Avoid resetPagination() here: it clears extraPages so page-2-only IDs vanish from `projects`
      // and the stale-selection effect clears the store. With no active filter, only clear typeahead text.
      if (debouncedFilter) updateFilter('')
      else clearTypeaheadOnly()
      if (onProjectSelect) onProjectSelect(selected)
    },
    [
      setSelectedProjectId,
      resetPagination,
      debouncedFilter,
      updateFilter,
      clearTypeaheadOnly,
      onProjectSelect,
      projects,
    ]
  )

  const favoriteProjectIdSet = useMemo(() => new Set(favoriteProjectIds), [favoriteProjectIds])

  const handleFavoriteAction = useCallback(
    (event: React.MouseEvent | undefined, itemId: string | number | undefined, actionId?: string | number) =>
      onFavoriteAction(toggleFavoriteProjectId, event, itemId, actionId),
    [toggleFavoriteProjectId]
  )

  const ProjectSelector = (
    <>
      <Select
        isOpen={isOpen}
        variant="typeahead"
        shouldFocusFirstItemOnOpen={false}
        onOpenChange={(open) => {
          setIsOpen(open)
          // Clear stale typeahead text when the dropdown closes without a selection
          // so reopening starts with a clean filter (mirrors PatternFly typeahead select UX).
          if (!open) clearTypeaheadOnly()
        }}
        popperProps={{ minWidth: PROJECT_SELECTOR_WIDTH, maxWidth: PROJECT_SELECTOR_WIDTH }}
        onSelect={handleSelect}
        onActionClick={handleFavoriteAction}
        selected={selectedProjectId ?? (requireProject ? undefined : ALL_PROJECTS_VALUE)}
        toggle={(toggleRef) => (
          <Tooltip
            content={selectedProject?.name ?? ''}
            trigger="manual"
            isVisible={isToggleHovered && !isOpen && !!selectedProject}
            position="bottom"
          >
            <MenuToggle
              ref={toggleRef}
              variant="typeahead"
              onClick={() => setIsOpen(!isOpen)}
              isExpanded={isOpen}
              status={menuToggleStatus}
              style={{ minWidth: PROJECT_SELECTOR_WIDTH }}
              onMouseEnter={() => setIsToggleHovered(true)}
              onMouseLeave={() => setIsToggleHovered(false)}
            >
              <TextInputGroup isPlain>
                <TextInputGroupMain
                  value={isOpen ? filterValue : toggleLabel}
                  aria-label="Project"
                  aria-invalid={menuToggleStatus === 'danger'}
                  onChange={(_e, val) => {
                    updateFilter(val)
                    if (!isOpen) setIsOpen(true)
                  }}
                  onClick={() => (isOpen ? null : setIsOpen(true))}
                  placeholder={toggleLabel}
                  autoComplete="off"
                />
                {renderInputUtilities(isOpen, filterValue, isFilterFetching, () => updateFilter(''))}
              </TextInputGroup>
            </MenuToggle>
          </Tooltip>
        )}
      >
        <SelectList style={{ maxHeight: PROJECT_SELECTOR_LIST_MAX_HEIGHT, overflow: 'auto' }}>
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
          {renderFilteredContent({
            noResults,
            debouncedFilter,
            projects,
            favoriteProjectsOrdered,
            favoriteProjectIdSet,
            hasMore,
            isLoadingMore,
            loadMore,
          })}
        </SelectList>
        {/* Sticky footer: always visible, does not scroll with the project list */}
        <Divider key="divider-create" />
        <SelectList>
          <SelectOption key={CREATE_PROJECT_VALUE} value={CREATE_PROJECT_VALUE} icon={<RhUiAddIcon />}>
            Create project
          </SelectOption>
        </SelectList>
        {hasMore && !noResults && !isFilterFetching && (
          <MenuFooter>
            <Content component={ContentVariants.small}>Type to refine results</Content>
          </MenuFooter>
        )}
      </Select>

      <ProjectFormModal
        isOpen={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onSuccess={() => {}} // refetch is handled in onCreated to avoid a race with setSelectedProjectId
        onCreated={(created) => {
          setCreateDialogOpen(false)
          const newId = created.id ?? null
          detachPromise(
            projectsQuery.refetch().finally(() => {
              setSelectedProjectId(newId)
            })
          )
        }}
      />
    </>
  )

  const isAllProjects = selectedProjectId === null
  const stableProjectId = selectedProject?.id ?? (isAllProjects ? undefined : (selectedProjectId ?? undefined))

  return { selectedProject, selectedProjectId, stableProjectId, isAllProjects, projects, ProjectSelector }
}
