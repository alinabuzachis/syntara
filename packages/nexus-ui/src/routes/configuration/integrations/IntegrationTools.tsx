import type { Tool } from '@ansible/nexus-contracts'
import {
  Button,
  CompassPanel,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  SearchInput,
  StackItem,
} from '@patternfly/react-core'
import { Thead, Tbody, Tr, Th, Td } from '@patternfly/react-table'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useParams } from 'wouter'

import { AppPage } from '../../../app/AppPage'
import { AppPageHeader } from '../../../app/AppPageHeader'
import { AppRoute } from '../../../app/AppRoute.tsx'
import noToolsImage from '../../../assets/collage-circle-sparkles-window-server-dark-RH.png'
import { toolManagerClient } from '../../../client'
import { useAlerts } from '../../../components/alerts'
import { EmptyStateFilter } from '../../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../../components/EmptyStateNoData'
import { useQueryState } from '../../../components/states/useQueryState'
import { ScrollableTableContainer, type TableFooterProps } from '../../../components/table/ScrollableTableContainer'
import { useFuse } from '../../../hooks/useFuse'
import { useTableSort } from '../../../hooks/useTableSort'
import { getErrorMessage } from '../../../utils/apiErrors'

// eslint-disable-next-line max-lines-per-function, complexity
export default function IntegrationTools() {
  const params = useParams()
  const [, navigate] = useLocation()
  const queryClient = useQueryClient()
  const provider_id = params?.provider_id ?? ''
  const { showAlert } = useAlerts()
  const [cursor, setCursor] = useState<string | null>(null)

  const integrationQuery = toolManagerClient.useQuery('get', '/tool_providers/{provider_id}', {
    params: { path: { provider_id } },
  })
  const provider = integrationQuery.data!
  const integrationQueryStatus = useQueryState(integrationQuery, 'Error loading tools')
  const query = toolManagerClient.useQuery('get', '/tools', {
    params: {
      query: {
        provider_id: provider_id,
        cursor: cursor ?? undefined,
        limit: 50,
        include_total: true,
      },
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
          void query.refetch()
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
    // Get all tools on current page that should be enabled (in enabledToolIds)
    const enableTools = results.filter((tool) => enabledToolIds.has(tool.id)).map((tool) => tool.id)
    // Get all tools on current page that should be disabled (not in enabledToolIds)
    const disableTools = results.filter((tool) => !enabledToolIds.has(tool.id)).map((tool) => tool.id)

    // Collect all update promises
    const updates: Promise<unknown>[] = []

    if (enableTools.length > 0) {
      updates.push(updateTools({ body: { tool_ids: enableTools, enabled: true } }))
    }
    if (disableTools.length > 0) {
      updates.push(updateTools({ body: { tool_ids: disableTools, enabled: false } }))
    }

    // Wait for all updates to complete before navigating
    if (updates.length > 0) {
      await Promise.all(updates)
      // Invalidate tools query cache so fresh data is fetched when returning to this page
      await queryClient.invalidateQueries({ queryKey: ['get', '/tools'] })
    }

    navigate(AppRoute.Configuration.Integrations.Root)
  }
  const {
    search,
    setSearch,
    items: filteredResults,
  } = useFuse<Tool>(query.data?.resources ?? [], [{ name: 'namespaced_name' }])

  const { getSortParams, sortData } = useTableSort({
    initialSortIndex: 0,
    initialDirection: 'asc',
  })

  // Sort the filtered results by name
  const results = sortData(filteredResults, (tool) => tool.namespaced_name ?? '')

  // Track filteredResults for state sync (not results, since sorting creates new array each render)
  const previousResultsRef = useRef(filteredResults)
  // Track enabled tool IDs across all pages
  const [enabledToolIds, setEnabledToolIds] = useState<Set<string>>(() => {
    const initialEnabled = new Set<string>()
    filteredResults.filter((tool) => tool.enabled).forEach((tool) => initialEnabled.add(tool.id))
    return initialEnabled
  })
  const [refreshDialogOpen, setRefreshDialogOpen] = useState(false)

  // Sync enabledToolIds when filteredResults change (e.g., page navigation, refresh)
  // This initializes enabledToolIds with tools that are enabled from the API
  // and preserves user selections when navigating between pages
  useEffect(() => {
    // Only update if filteredResults actually changed (not on every sort)
    if (previousResultsRef.current !== filteredResults) {
      previousResultsRef.current = filteredResults
      // Use queueMicrotask to avoid calling setState synchronously within an effect
      queueMicrotask(() => {
        setEnabledToolIds((prev) => {
          const updated = new Set(prev)
          // Add tools that are enabled on the current page (from API)
          filteredResults.filter((tool) => tool.enabled).forEach((tool) => updated.add(tool.id))
          // Note: We preserve selections for tools not on the current page
          // This allows tracking enabled tools across all pages
          return updated
        })
      })
    }
  }, [filteredResults])

  // Get enabled tools for the current page
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
        <SearchInput
          placeholder="Search tools..."
          value={search}
          onChange={(_event, value) => setSearch(value)}
          onClear={() => setSearch('')}
          style={{ width: '250px' }}
        />
        <Button variant="secondary" onClick={() => setRefreshDialogOpen(true)}>
          Refresh tools
        </Button>
        <Button onClick={() => void handleSubmit()}>Save</Button>
        <Button variant="secondary" onClick={() => navigate(AppRoute.Configuration.Integrations.Root)}>
          Cancel
        </Button>
      </AppPageHeader>
      {results.length === 0 ? (
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel isFullHeight>
            {search ? (
              <EmptyStateFilter clearAllFilters={() => setSearch('')} imageSrc={noToolsImage} imageAlt="No results" />
            ) : (
              <EmptyStateNoData
                title="No tools available"
                description={`No tools found for "${provider?.name}". Click the button below to refresh and fetch the latest tools from this integration.`}
                buttonText="Refresh tools"
                addData={handleRefreshTools}
                imageSrc={noToolsImage}
                imageAlt="No tools available"
              />
            )}
          </CompassPanel>
        </StackItem>
      ) : (
        <ScrollableTableContainer
          aria-label="Tools table"
          isExpandable
          footer={
            {
              content: (
                <>
                  {selectedToolIds.size > 0 ? (
                    <>
                      {selectedToolIds.size} of {results.length} {results.length === 1 ? 'tool' : 'tools'} enabled
                      {query.data?.total && query.data.total > results.length && (
                        <span style={{ opacity: 0.6 }}> (of {query.data.total} total)</span>
                      )}
                    </>
                  ) : (
                    <>
                      {results.length} {results.length === 1 ? 'tool' : 'tools'}
                      {query.data?.total && query.data.total > results.length && (
                        <span style={{ opacity: 0.6 }}> (of {query.data.total} total)</span>
                      )}
                    </>
                  )}
                </>
              ),
              prev: query.data?.prev ?? null,
              next: query.data?.next ?? null,
              onPrev: () => {
                if (query.data?.prev !== undefined) {
                  setCursor(query.data.prev)
                }
              },
              onNext: () => {
                if (query.data?.next !== undefined) {
                  setCursor(query.data.next)
                }
              },
            } satisfies TableFooterProps
          }
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
      <Modal isOpen={refreshDialogOpen} onClose={() => setRefreshDialogOpen(false)} variant="small">
        <ModalHeader title="Refresh tools" />
        <ModalBody>
          Are you sure you want to refresh tools for "{provider?.name}"? This will fetch the latest tools from the
          integration.
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" onClick={handleRefreshTools}>
            Refresh
          </Button>
          <Button variant="link" onClick={() => setRefreshDialogOpen(false)}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </AppPage>
  )
}
