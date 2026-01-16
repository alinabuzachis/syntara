import type { ToolProvider } from '@ansible/nexus-contracts'
import {
  Button,
  CompassPanel,
  Dropdown,
  DropdownGroup,
  DropdownItem,
  DropdownList,
  Gallery,
  MenuToggle,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  SearchInput,
  StackItem,
} from '@patternfly/react-core'
import type { MenuToggleElement } from '@patternfly/react-core'
import {
  CheckCircleIcon,
  RhUiEllipsisVerticalFillIcon,
  EyeIcon,
  RhUiTrashIcon,
  SyncAltIcon,
  TimesCircleIcon,
} from '@patternfly/react-icons'
import { Thead, Tbody, Tr, Th, Td, ActionsColumn } from '@patternfly/react-table'
import type { IAction } from '@patternfly/react-table'
import { useState } from 'react'
import { useLocation } from 'wouter'

import { AppPage } from '../../../app/AppPage'
import { AppPageHeader } from '../../../app/AppPageHeader'
import { AppRoute } from '../../../app/AppRoute'
import noResultsImage from '../../../assets/collage-circle-sparkles-window-server-dark-RH.png'
import { toolProvidersClient } from '../../../client'
import { useAlerts } from '../../../components/alerts'
import { EmptyStateFilter } from '../../../components/EmptyStateFilter'
import { IconLabel } from '../../../components/IconLabel'
import { useQueryState } from '../../../components/states/useQueryState'
import { ScrollableTableContainer } from '../../../components/table/ScrollableTableContainer'
import { useFuse } from '../../../hooks/useFuse'
import { getErrorMessage } from '../../../utils/apiErrors'

import { IntegrationCard } from './IntegrationCard'
import { IntegrationEmptyState } from './IntegrationEmptyState'

type ProviderStatus = 'available' | 'error' | 'validating'

const statusIcons: Record<ProviderStatus, React.ComponentType<{ className?: string }>> = {
  available: CheckCircleIcon,
  error: TimesCircleIcon,
  validating: SyncAltIcon,
}

const statusColors: Record<ProviderStatus, string> = {
  available: 'var(--pf-t--global--color--status--success--default)',
  error: 'var(--pf-t--global--color--status--danger--default)',
  validating: 'var(--pf-t--global--color--status--info--default)',
}

function StatusLabel({ status }: { status: string }) {
  const providerStatus = status as ProviderStatus
  const Icon = statusIcons[providerStatus] || TimesCircleIcon
  const color = statusColors[providerStatus] || 'var(--pf-t--global--color--status--default--default)'
  const capitalizedStatus = status.charAt(0).toUpperCase() + status.slice(1)

  return (
    <IconLabel icon={<Icon />} color={color}>
      {capitalizedStatus}
    </IconLabel>
  )
}

export default function Integrations() {
  const [, navigate] = useLocation()
  const [cursor, setCursor] = useState<string | null>(null)
  const query = toolProvidersClient.useQuery('get', '/tool_providers', {
    params: {
      query: {
        cursor: cursor ?? undefined,
        limit: 20,
        include_total: true,
      },
    },
  })
  const { search, setSearch, items: results } = useFuse<ToolProvider>(query.data?.resources ?? [], [{ name: 'name' }])
  const { showAlert } = useAlerts()

  const [validateDialogOpen, setValidateDialogOpen] = useState(false)
  const [providerToValidate, setProviderToValidate] = useState<ToolProvider | null>(null)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [providerToDelete, setProviderToDelete] = useState<ToolProvider | null>(null)

  const { mutate: validateProvider } = toolProvidersClient.useMutation('post', '/tool_providers/{provider_id}/validate')
  const { mutate: deleteProvider } = toolProvidersClient.useMutation('delete', '/tool_providers/{provider_id}')

  const handleValidate = () => {
    if (!providerToValidate) return

    validateProvider(
      { params: { path: { provider_id: providerToValidate.id } } },
      {
        onSuccess: () => {
          showAlert({
            title: 'Validation successful',
            description: `Provider "${providerToValidate.name}" validated successfully.`,
            variant: 'success',
            autoDismiss: true,
          })
          void query.refetch()
        },
        onError: (error: unknown) => {
          showAlert({
            title: 'Validation failed',
            description: `Failed to validate provider "${providerToValidate.name}": ${getErrorMessage(error)}`,
            variant: 'error',
            autoDismiss: true,
          })
        },
        onSettled: () => {
          setValidateDialogOpen(false)
          setProviderToValidate(null)
        },
      }
    )
  }

  const handleDelete = () => {
    if (!providerToDelete) return

    deleteProvider(
      { params: { path: { provider_id: providerToDelete.id } } },
      {
        onSuccess: () => {
          showAlert({
            title: 'Integration deleted',
            description: `Integration "${providerToDelete.name}" has been deleted successfully.`,
            variant: 'success',
            autoDismiss: true,
          })
          void query.refetch()
        },
        onError: (error: unknown) => {
          showAlert({
            title: 'Delete failed',
            description: `Failed to delete integration "${providerToDelete.name}": ${getErrorMessage(error)}`,
            variant: 'error',
            autoDismiss: true,
          })
        },
        onSettled: () => {
          setDeleteDialogOpen(false)
          setProviderToDelete(null)
        },
      }
    )
  }

  // Row actions for PF ActionsColumn
  const getRowActions = (provider: ToolProvider): IAction[] => [
    {
      title: <IconLabel icon={<EyeIcon />}>View and enable/disable tools</IconLabel>,
      onClick: () => navigate(`/configuration/integrations/${provider.id}/tools`),
    },
    {
      title: <IconLabel icon={<CheckCircleIcon />}>Validate connection</IconLabel>,
      onClick: () => {
        setProviderToValidate(provider)
        setValidateDialogOpen(true)
      },
    },
    { isSeparator: true },
    {
      title: <IconLabel icon={<RhUiTrashIcon />}>Uninstall</IconLabel>,
      onClick: () => {
        setProviderToDelete(provider)
        setDeleteDialogOpen(true)
      },
    },
  ]

  const [view, setView] = useState<'table' | 'cards'>('table')
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false)

  const queryState = useQueryState(query, 'Error loading integrations')
  if (queryState) {
    return (
      <AppPage>
        <AppPageHeader title="Integrations" />
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel isFullHeight>{queryState}</CompassPanel>
        </StackItem>
      </AppPage>
    )
  }

  return (
    <AppPage>
      {query.data?.resources && query.data.resources.length > 0 && (
        <AppPageHeader title="Integrations">
          <SearchInput
            placeholder="Search integrations..."
            value={search}
            onChange={(_event, value) => setSearch(value)}
            onClear={() => setSearch('')}
            style={{ width: '250px' }}
          />
          <Button variant="primary" onClick={() => navigate(AppRoute.Configuration.Integrations.Configure)}>
            Add Integration
          </Button>
          <Dropdown
            isOpen={isViewMenuOpen}
            onOpenChange={(isOpen) => setIsViewMenuOpen(isOpen)}
            toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
              <MenuToggle
                ref={toggleRef}
                onClick={() => setIsViewMenuOpen(!isViewMenuOpen)}
                isExpanded={isViewMenuOpen}
                variant="plain"
              >
                <RhUiEllipsisVerticalFillIcon />
              </MenuToggle>
            )}
          >
            <DropdownList>
              <DropdownGroup label="View">
                <DropdownItem
                  key="table"
                  isSelected={view === 'table'}
                  onClick={() => {
                    setView('table')
                    setIsViewMenuOpen(false)
                  }}
                >
                  Table
                </DropdownItem>
                <DropdownItem
                  key="cards"
                  isSelected={view === 'cards'}
                  onClick={() => {
                    setView('cards')
                    setIsViewMenuOpen(false)
                  }}
                >
                  Cards
                </DropdownItem>
              </DropdownGroup>
            </DropdownList>
          </Dropdown>
        </AppPageHeader>
      )}
      {view !== 'cards' ? (
        results.length === 0 ? (
          search ? (
            <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
              <CompassPanel isFullHeight>
                <EmptyStateFilter
                  clearAllFilters={() => setSearch('')}
                  imageSrc={noResultsImage}
                  imageAlt="No results"
                />
              </CompassPanel>
            </StackItem>
          ) : (
            <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
              <IntegrationEmptyState />
            </StackItem>
          )
        ) : (
          <ScrollableTableContainer
            aria-label="Integrations table"
            footer={{
              content: (
                <>
                  {results.length} {results.length === 1 ? 'integration' : 'integrations'}
                  {query.data?.total && query.data.total > results.length && (
                    <span style={{ opacity: 0.6 }}> (of {query.data.total} total)</span>
                  )}
                </>
              ),
              prev: query.data?.prev ?? null,
              next: query.data?.next ?? null,
              onPrev: () => setCursor(query.data?.prev ?? null),
              onNext: () => setCursor(query.data?.next ?? null),
            }}
          >
            <Thead>
              <Tr>
                <Th>Name</Th>
                <Th>Status</Th>
                <Th>Integration type</Th>
                <Th>Tools</Th>
                <Th screenReaderText="Actions" />
              </Tr>
            </Thead>
            <Tbody>
              {results.map((provider) => (
                <Tr key={provider.id}>
                  <Td dataLabel="Name">{provider.name}</Td>
                  <Td dataLabel="Status">
                    <StatusLabel status={provider.status ?? 'unknown'} />
                  </Td>
                  <Td dataLabel="Integration type">
                    {(provider.configuration as { provider_type?: string }).provider_type}
                  </Td>
                  <Td dataLabel="Tools">{(provider as { tool_count?: number }).tool_count}</Td>
                  <Td isActionCell>
                    <ActionsColumn items={getRowActions(provider)} />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </ScrollableTableContainer>
        )
      ) : (
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel>
            <Gallery hasGutter minWidths={{ default: '500px' }} style={{ padding: 'var(--pf-t--global--spacer--2xl)' }}>
              {results.map((integration) => (
                <IntegrationCard key={integration.id} integration={integration} />
              ))}
            </Gallery>
          </CompassPanel>
        </StackItem>
      )}
      <Modal isOpen={validateDialogOpen} onClose={() => setValidateDialogOpen(false)} variant="small">
        <ModalHeader title="Validate integration" />
        <ModalBody>Are you sure you want to validate the connection for "{providerToValidate?.name}"?</ModalBody>
        <ModalFooter>
          <Button variant="primary" onClick={handleValidate}>
            Validate
          </Button>
          <Button variant="link" onClick={() => setValidateDialogOpen(false)}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
      <Modal isOpen={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} variant="small">
        <ModalHeader title="Delete integration" />
        <ModalBody>Are you sure you want to delete "{providerToDelete?.name}"? This action cannot be undone.</ModalBody>
        <ModalFooter>
          <Button variant="danger" onClick={handleDelete}>
            Delete
          </Button>
          <Button variant="link" onClick={() => setDeleteDialogOpen(false)}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </AppPage>
  )
}
