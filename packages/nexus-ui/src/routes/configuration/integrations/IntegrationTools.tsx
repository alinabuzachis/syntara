import type { Tool } from '@ansible/nexus-contracts'
import {
  Button,
  CompassPanel,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Stack,
  StackItem,
} from '@patternfly/react-core'
import { Thead, Tbody, Tr, Th, Td } from '@patternfly/react-table'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useParams } from 'wouter'

import { AppPage } from '../../../app/AppPage'
import { AppPageHeader } from '../../../app/AppPageHeader'
import { AppRoute } from '../../../app/AppRoute.tsx'
import noToolsImage from '../../../assets/collage-circle-sparkles-window-server-dark-RH.png'
import { toolManagerClient } from '../../../client'
import { useAlerts } from '../../../components/alerts'
import { ConfirmationDialog } from '../../../components/ConfirmationDialog'
import { EmptyStateFilter } from '../../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../../components/EmptyStateNoData'
import { FilterBar } from '../../../components/filters/FilterBar'
import { useQueryState } from '../../../components/states/useQueryState'
import { ScrollableTableContainer } from '../../../components/table/ScrollableTableContainer'
import { TotalCount } from '../../../components/table/TotalCount'
import { useCursorPagination, useCursorReset } from '../../../hooks/useCursorPagination'
import { useMutationErrorHandler } from '../../../hooks/useMutationErrorHandler'
import { useTableSort } from '../../../hooks/useTableSort'
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

// eslint-disable-next-line max-lines-per-function
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
    setCursor,
    filters,
    hasActiveFilters,
    queryParams,
    handleFilterChange,
    handleClearAllFilters,
    getFooterProps,
  } = useCursorPagination({ limit: 50, extraParams })

  // Define filter field definitions for FilterBar
  const filterFieldDefinitions = useMemo<FilterFieldDefinition[]>(() => [getIntegrationNameFilterDefinition()], [])

  const integrationQuery = toolManagerClient.useQuery('get', '/tool_providers/{provider_id}', {
    params: { path: { provider_id } },
  })
  const provider = integrationQuery.data!
  const integrationQueryStatus = useQueryState(integrationQuery, {
    title: 'Error loading tools',
    onRetry: () => detachPromise(integrationQuery.refetch()),
  })
  const query = toolManagerClient.useQuery('get', '/tools', {
    params: {
      query: queryParams,
    },
  })
  const { mutateAsync: updateTools } = toolManagerClient.useMutation('patch', '/tools/bulk_update')
  const { mutate: refreshTools } = toolManagerClient.useMutation('post', '/tool_providers/{provider_id}/refresh_tools')

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
      await queryClient.invalidateQueries({ queryKey: ['get', '/tools'] })
    }

    navigate(AppRoute.Configuration.Integrations.Root)
  }

  const tools = useMemo(() => query.data?.resources ?? [], [query.data?.resources])

  const { getSortParams, sortData } = useTableSort({
    initialSortIndex: 0,
    initialDirection: 'asc',
  })

  const results = sortData(tools, (tool) => tool.namespaced_name ?? '')

  useCursorReset(results.length, hasActiveFilters, cursor, query.isFetching, setCursor)

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
    return (
      <AppPage>
        <AppPageHeader title={provider?.name ? `${provider.name} tools` : 'Tools'} />
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel isFullHeight>{integrationQueryStatus}</CompassPanel>
        </StackItem>
      </AppPage>
    )
  }

  return (
    <AppPage>
      <AppPageHeader title={`${provider?.name} tools`}>
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
      </AppPageHeader>
      {results.length === 0 && !hasActiveFilters ? (
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel isFullHeight>
            <EmptyStateNoData
              title="No tools available"
              description={`No tools found for "${provider?.name}". Click the button below to refresh and fetch the latest tools from this integration.`}
              buttonText="Refresh tools"
              addData={handleRefreshTools}
              imageSrc={noToolsImage}
              imageAlt="No tools available"
            />
          </CompassPanel>
        </StackItem>
      ) : (
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel isFullHeight>
            <Stack style={{ height: '100%', padding: '0 var(--pf-t--global--spacer--sm)' }}>
              <FilterBar
                fieldDefinitions={filterFieldDefinitions}
                filters={filters}
                onFilterChange={handleFilterChange}
                showClearAll={true}
              />

              {results.length === 0 ? (
                <StackItem isFilled style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <EmptyStateFilter
                    clearAllFilters={handleClearAllFilters}
                    imageSrc={noToolsImage}
                    imageAlt="No results"
                  />
                </StackItem>
              ) : (
                <ScrollableTableContainer
                  aria-label="Tools table"
                  isExpandable
                  footer={{
                    ...getFooterProps(query.data, results.length, 'tool', 'tools'),
                    content: (
                      <>
                        {selectedToolIds.size > 0 ? (
                          <>
                            {selectedToolIds.size} of {results.length} {results.length === 1 ? 'tool' : 'tools'} enabled
                          </>
                        ) : (
                          <>
                            {results.length} {results.length === 1 ? 'tool' : 'tools'}
                          </>
                        )}
                        {query.data?.total != null && query.data.total > results.length && (
                          <TotalCount total={query.data.total} />
                        )}
                      </>
                    ),
                  }}
                >
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
                </ScrollableTableContainer>
              )}
            </Stack>
          </CompassPanel>
        </StackItem>
      )}

      <ConfirmationDialog
        isOpen={refreshDialogOpen}
        onClose={() => setRefreshDialogOpen(false)}
        onConfirm={handleRefreshTools}
        title="Refresh tools"
        confirmLabel="Refresh"
      >
        Are you sure you want to refresh tools for &quot;{provider?.name}&quot;? This will fetch the latest tools from
        the integration.
      </ConfirmationDialog>
    </AppPage>
  )
}
