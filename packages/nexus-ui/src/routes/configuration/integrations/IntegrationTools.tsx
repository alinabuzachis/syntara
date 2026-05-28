import type { Tool } from '@ansible/nexus-contracts'
import {
  Button,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  StackItem,
} from '@patternfly/react-core'
import type { ThProps } from '@patternfly/react-table'
import { Thead, Tbody, Tr, Th, Td } from '@patternfly/react-table'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useParams } from 'wouter'

import { AppRoute } from '../../../app/AppRoute.tsx'
import { breadcrumbsIntegrationTools } from '../../../app/breadcrumbBuilders'
import noToolsImage from '../../../assets/collage-circle-sparkles-window-server-dark-RH.png'
import { toolManagerClient } from '../../../client'
import { NxConfirmationDialog } from '../../../components/dialogs/NxConfirmationDialog'
import { EmptyStateFilter } from '../../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../../components/EmptyStateNoData'
import { FilterBar } from '../../../components/filters/FilterBar'
import { NxPage, NxPageBody } from '../../../components/layout/NxPage'
import { NxPageHeader } from '../../../components/layout/NxPageHeader'
import { NxPanel } from '../../../components/layout/NxPanel'
import { NxPanelContentStack } from '../../../components/layout/NxPanelContentStack'
import { useQueryState } from '../../../components/states/useQueryState'
import { NxScrollableTableContainer } from '../../../components/table/NxScrollableTableContainer.tsx'
import { useCursorPagination, useCursorReset, type UseCursorPaginationResult } from '../../../hooks/useCursorPagination'
import { useMutationErrorHandler } from '../../../hooks/useMutationErrorHandler'
import { useTableSort } from '../../../hooks/useTableSort'
import { useAlerts } from '../../../providers/alerts'
import type { FilterFieldDefinition } from '../../../types/filters'
import { getErrorMessage } from '../../../utils/apiErrors'
import { detachPromise } from '../../../utils/detachPromise'

import { getIntegrationNameFilterDefinition } from './integrationFilters'

/**
 * Reconcile enabled IDs with the latest API slice: for each tool in `tools`, enabled state comes
 * only from the payload (so a tool that is now disabled is removed). IDs not present in this
 * response keep their previous entries so pagination does not lose off-page selections until
 * those rows load again.
 */
function mergeEnabledToolIdsFromApi(previous: Set<string>, tools: Tool[]): Set<string> {
  const idsOnPage = new Set(tools.map((t) => t.id))
  const enabledOnPage = new Set(tools.filter((t) => t.enabled).map((t) => t.id))
  const next = new Set<string>()
  for (const id of previous) {
    if (!idsOnPage.has(id)) {
      next.add(id)
    }
  }
  for (const id of enabledOnPage) {
    next.add(id)
  }
  return next
}

type IntegrationToolsLoadedViewProps = Readonly<{
  providerName: string
  navigate: (path: string) => void
  setRefreshDialogOpen: (open: boolean) => void
  handleRefreshTools: () => void
  handleSubmit: () => Promise<void>
  handleMutationError: ReturnType<typeof useMutationErrorHandler>
  results: Tool[]
  hasActiveFilters: boolean
  filterFieldDefinitions: FilterFieldDefinition[]
  filters: UseCursorPaginationResult['filters']
  handleFilterChange: UseCursorPaginationResult['handleFilterChange']
  handleClearAllFilters: UseCursorPaginationResult['handleClearAllFilters']
  getFooterProps: UseCursorPaginationResult['getFooterProps']
  queryData: { total?: number | null } | undefined
  selectedToolIds: Set<string>
  allSelected: boolean
  getSortParams: (index: number) => ThProps['sort']
  handleSelectAll: (checked: boolean) => void
  handleSelectTool: (tool: Tool, checked: boolean) => void
  refreshDialogOpen: boolean
}>

/** Presentational split for line limits; props mirror parent state — follow-up: smaller slices (table body only) or context. */
function IntegrationToolsLoadedView({
  providerName,
  navigate,
  setRefreshDialogOpen,
  handleRefreshTools,
  handleSubmit,
  handleMutationError,
  results,
  hasActiveFilters,
  filterFieldDefinitions,
  filters,
  handleFilterChange,
  handleClearAllFilters,
  getFooterProps,
  queryData,
  selectedToolIds,
  allSelected,
  getSortParams,
  handleSelectAll,
  handleSelectTool,
  refreshDialogOpen,
}: IntegrationToolsLoadedViewProps) {
  return (
    <NxPage>
      <NxPageHeader
        title={`${providerName} tools`}
        breadcrumbs={breadcrumbsIntegrationTools(providerName)}
        toolbar={
          <>
            <Button variant="secondary" onClick={() => setRefreshDialogOpen(true)}>
              Refresh tools
            </Button>
            <Button
              onClick={async () => {
                try {
                  await handleSubmit()
                } catch (error: unknown) {
                  handleMutationError({ title: 'Failed to save tools' })(error)
                }
              }}
            >
              Save
            </Button>
            <Button variant="secondary" onClick={() => navigate(AppRoute.Configuration.Integrations.Root)}>
              Cancel
            </Button>
          </>
        }
      />
      {results.length === 0 && !hasActiveFilters ? (
        <NxPageBody>
          <NxPanel isFullHeight>
            <EmptyStateNoData
              title="No tools available"
              description={`No tools found for "${providerName}". Click the button below to refresh and fetch the latest tools from this integration.`}
              buttonText="Refresh tools"
              addData={handleRefreshTools}
              imageSrc={noToolsImage}
              imageAlt="No tools available"
            />
          </NxPanel>
        </NxPageBody>
      ) : (
        <NxPageBody>
          <NxPanel isFullHeight>
            <NxPanelContentStack variant="inset">
              <StackItem>
                <FilterBar
                  fieldDefinitions={filterFieldDefinitions}
                  filters={filters}
                  onFilterChange={handleFilterChange}
                  showClearAll={true}
                />
              </StackItem>

              {results.length === 0 ? (
                <NxPageBody isCentered>
                  <EmptyStateFilter
                    clearAllFilters={handleClearAllFilters}
                    imageSrc={noToolsImage}
                    imageAlt="No results"
                  />
                </NxPageBody>
              ) : (
                <NxScrollableTableContainer aria-label="Tools table" isExpandable footer={getFooterProps(queryData)}>
                  <Thead>
                    <Tr>
                      <Th
                        select={{
                          onSelect: (_event, isSelecting) => handleSelectAll(isSelecting),
                          isSelected: allSelected,
                          isHeaderSelectDisabled: results.length === 0,
                        }}
                        screenReaderText="Select all tools"
                      />
                      <Th sort={getSortParams(0)}>Name</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {results.map((tool, index) => (
                      <Tr key={tool.id}>
                        <Td
                          select={{
                            rowIndex: index,
                            onSelect: (_event, isSelecting) => handleSelectTool(tool, isSelecting),
                            isSelected: selectedToolIds.has(tool.id),
                          }}
                        />
                        <Td dataLabel="Name">
                          <DescriptionList>
                            <DescriptionListGroup>
                              <DescriptionListTerm>{tool.namespaced_name}</DescriptionListTerm>
                              <DescriptionListDescription>{tool.description}</DescriptionListDescription>
                            </DescriptionListGroup>
                          </DescriptionList>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </NxScrollableTableContainer>
              )}
            </NxPanelContentStack>
          </NxPanel>
        </NxPageBody>
      )}

      <NxConfirmationDialog
        isOpen={refreshDialogOpen}
        onClose={() => setRefreshDialogOpen(false)}
        onConfirm={handleRefreshTools}
        title="Refresh tools"
        confirmLabel="Refresh"
      >
        Are you sure you want to refresh tools for &quot;{providerName}&quot;? This will fetch the latest tools from the
        integration.
      </NxConfirmationDialog>
    </NxPage>
  )
}

export default function IntegrationTools() {
  const params = useParams()
  const [, navigate] = useLocation()
  const queryClient = useQueryClient()
  const provider_id = params?.provider_id ?? ''
  const { showAlert } = useAlerts()
  const handleMutationError = useMutationErrorHandler()

  const extraParams = useMemo(() => ({ provider_id }), [provider_id])

  const {
    cursor,
    resetPagination,
    filters,
    hasActiveFilters,
    queryParams,
    handleFilterChange,
    handleClearAllFilters,
    getFooterProps,
  } = useCursorPagination({ limit: 50, extraParams })

  // Define filter field definitions for FilterBar
  const filterFieldDefinitions = useMemo<FilterFieldDefinition[]>(() => [getIntegrationNameFilterDefinition()], [])

  const integrationQuery = toolManagerClient.useQuery('get', '/tool_manager/tool_providers/{provider_id}', {
    params: { path: { provider_id } },
  })
  const provider = integrationQuery.data!
  const integrationQueryStatus = useQueryState(integrationQuery, {
    title: 'Error loading tools',
    onRetry: () => detachPromise(integrationQuery.refetch()),
  })
  const query = toolManagerClient.useQuery('get', '/tool_manager/tools', {
    params: {
      query: queryParams,
    },
  })
  const { mutateAsync: updateTools } = toolManagerClient.useMutation('patch', '/tool_manager/tools/bulk_update')
  const { mutate: refreshTools } = toolManagerClient.useMutation(
    'post',
    '/tool_manager/tool_providers/{provider_id}/refresh_tools'
  )

  const handleRefreshTools = () => {
    refreshTools(
      { params: { path: { provider_id } } },
      {
        onSuccess: () => {
          setRefreshDialogOpen(false)
          showAlert({
            title: 'Tools refreshed',
            description: `Tools for "${provider.name}" have been refreshed successfully.`,
            variant: 'success',
            autoDismiss: true,
          })
          detachPromise(query.refetch())
        },
        onError: (error) => {
          setRefreshDialogOpen(false)
          showAlert({
            title: 'Refresh failed',
            description: `Failed to refresh tools for "${provider.name}": ${getErrorMessage(error)}`,
            variant: 'error',
            autoDismiss: true,
          })
        },
      }
    )
  }

  const handleSubmit = async () => {
    const enableTools = results.filter((tool) => enabledToolIds.has(tool.id)).map((tool) => tool.id)
    const disableTools = results.filter((tool) => !enabledToolIds.has(tool.id)).map((tool) => tool.id)

    const updates: Promise<unknown>[] = []

    if (enableTools.length > 0) {
      updates.push(updateTools({ body: { tool_ids: enableTools, enabled: true } }))
    }
    if (disableTools.length > 0) {
      updates.push(updateTools({ body: { tool_ids: disableTools, enabled: false } }))
    }

    if (updates.length > 0) {
      await Promise.all(updates)
      await queryClient.invalidateQueries({ queryKey: ['get', '/tool_manager/tools'] })
    }

    navigate(AppRoute.Configuration.Integrations.Root)
  }

  const tools = useMemo(() => (query.data?.resources ?? []) as Tool[], [query.data?.resources])

  const { getSortParams, sortData } = useTableSort({
    initialSortIndex: 0,
    initialDirection: 'asc',
  })

  const results = sortData(tools, (tool) => tool.namespaced_name ?? '')

  useCursorReset(results.length, hasActiveFilters, cursor, query.isFetching, resetPagination)

  // Track tools for state sync (not results, since sorting creates new array each render)
  const previousResultsRef = useRef(tools)
  const [enabledToolIds, setEnabledToolIds] = useState<Set<string>>(() => {
    const initialEnabled = new Set<string>()
    tools.filter((tool) => tool.enabled).forEach((tool) => initialEnabled.add(tool.id))
    return initialEnabled
  })
  const [refreshDialogOpen, setRefreshDialogOpen] = useState(false)

  // Sync enabledToolIds when tools change (e.g., page navigation, refresh).
  useEffect(() => {
    if (previousResultsRef.current !== tools) {
      previousResultsRef.current = tools
      queueMicrotask(() => {
        setEnabledToolIds((prev) => mergeEnabledToolIdsFromApi(prev, tools))
      })
    }
  }, [tools])

  const enabledTools = results.filter((tool) => enabledToolIds.has(tool.id))
  const selectedToolIds = new Set(enabledTools.map((tool) => tool.id))
  const allSelected = results.length > 0 && selectedToolIds.size === results.length

  const handleSelectAll = (checked: boolean) => {
    setEnabledToolIds((prev) => {
      const updated = new Set(prev)
      if (checked) {
        results.forEach((tool) => updated.add(tool.id))
      } else {
        results.forEach((tool) => updated.delete(tool.id))
      }
      return updated
    })
  }

  const handleSelectTool = (tool: Tool, checked: boolean) => {
    setEnabledToolIds((prev) => {
      const updated = new Set(prev)
      if (checked) {
        updated.add(tool.id)
      } else {
        updated.delete(tool.id)
      }
      return updated
    })
  }

  if (integrationQueryStatus) {
    const toolsTitle = provider?.name ? `${provider.name} tools` : 'Tools'
    const toolsBreadcrumbs = provider?.name ? breadcrumbsIntegrationTools(provider.name) : undefined
    return (
      <NxPage>
        <NxPageHeader title={toolsTitle} breadcrumbs={toolsBreadcrumbs} />
        <NxPageBody>
          <NxPanel isFullHeight>{integrationQueryStatus}</NxPanel>
        </NxPageBody>
      </NxPage>
    )
  }

  return (
    <IntegrationToolsLoadedView
      providerName={provider?.name ?? ''}
      navigate={navigate}
      setRefreshDialogOpen={setRefreshDialogOpen}
      handleRefreshTools={handleRefreshTools}
      handleSubmit={handleSubmit}
      handleMutationError={handleMutationError}
      results={results}
      hasActiveFilters={hasActiveFilters}
      filterFieldDefinitions={filterFieldDefinitions}
      filters={filters}
      handleFilterChange={handleFilterChange}
      handleClearAllFilters={handleClearAllFilters}
      getFooterProps={getFooterProps}
      queryData={query.data}
      selectedToolIds={selectedToolIds}
      allSelected={allSelected}
      getSortParams={getSortParams}
      handleSelectAll={handleSelectAll}
      handleSelectTool={handleSelectTool}
      refreshDialogOpen={refreshDialogOpen}
    />
  )
}
