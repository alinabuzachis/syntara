import type { ToolProvider } from '@ansible/nexus-contracts'
import {
  Button,
  CompassPanel,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  SearchInput,
  StackItem,
} from '@patternfly/react-core'
import {
  RhUiCheckCircleIcon,
  RhUiViewIcon,
  RhUiTrashIcon,
  RhUiSyncIcon,
  RhUiCloseCircleIcon,
} from '@patternfly/react-icons'
import { Thead, Tbody, Tr, Th, Td, ActionsColumn } from '@patternfly/react-table'
import type { IAction } from '@patternfly/react-table'
import { useReducer } from 'react'
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
import { useTableSort } from '../../../hooks/useTableSort'
import { getErrorMessage } from '../../../utils/apiErrors'

import { IntegrationEmptyState } from './IntegrationEmptyState'

type ProviderStatus = 'available' | 'error' | 'validating'

const statusIcons: Record<ProviderStatus, React.ComponentType<{ className?: string }>> = {
  available: RhUiCheckCircleIcon,
  error: RhUiCloseCircleIcon,
  validating: RhUiSyncIcon,
}

const statusColors: Record<ProviderStatus, string> = {
  available: 'var(--pf-t--global--color--status--success--default)',
  error: 'var(--pf-t--global--color--status--danger--default)',
  validating: 'var(--pf-t--global--color--status--info--default)',
}

function StatusLabel({ status }: { status: string }) {
  const providerStatus = status as ProviderStatus
  const Icon = statusIcons[providerStatus] || RhUiCloseCircleIcon
  const color = statusColors[providerStatus] || 'var(--pf-t--global--color--status--default--default)'
  const capitalizedStatus = status.charAt(0).toUpperCase() + status.slice(1)

  return (
    <IconLabel icon={<Icon />} color={color}>
      {capitalizedStatus}
    </IconLabel>
  )
}

interface IntegrationsState {
  cursor: string | null
  validateDialogOpen: boolean
  providerToValidate: ToolProvider | null
  deleteDialogOpen: boolean
  providerToDelete: ToolProvider | null
}

type IntegrationsAction =
  | { type: 'SET_CURSOR'; payload: string | null }
  | { type: 'SET_VALIDATE_DIALOG'; payload: boolean }
  | { type: 'SET_PROVIDER_TO_VALIDATE'; payload: ToolProvider | null }
  | { type: 'SET_DELETE_DIALOG'; payload: boolean }
  | { type: 'SET_PROVIDER_TO_DELETE'; payload: ToolProvider | null }
  | { type: 'OPEN_VALIDATE_DIALOG'; payload: ToolProvider }
  | { type: 'OPEN_DELETE_DIALOG'; payload: ToolProvider }
  | { type: 'CLOSE_VALIDATE_DIALOG' }
  | { type: 'CLOSE_DELETE_DIALOG' }

function integrationsReducer(state: IntegrationsState, action: IntegrationsAction): IntegrationsState {
  switch (action.type) {
    case 'SET_CURSOR':
      return { ...state, cursor: action.payload }
    case 'SET_VALIDATE_DIALOG':
      return { ...state, validateDialogOpen: action.payload }
    case 'SET_PROVIDER_TO_VALIDATE':
      return { ...state, providerToValidate: action.payload }
    case 'SET_DELETE_DIALOG':
      return { ...state, deleteDialogOpen: action.payload }
    case 'SET_PROVIDER_TO_DELETE':
      return { ...state, providerToDelete: action.payload }
    case 'OPEN_VALIDATE_DIALOG':
      return { ...state, providerToValidate: action.payload, validateDialogOpen: true }
    case 'OPEN_DELETE_DIALOG':
      return { ...state, providerToDelete: action.payload, deleteDialogOpen: true }
    case 'CLOSE_VALIDATE_DIALOG':
      return { ...state, validateDialogOpen: false, providerToValidate: null }
    case 'CLOSE_DELETE_DIALOG':
      return { ...state, deleteDialogOpen: false, providerToDelete: null }
    default:
      return state
  }
}

export default function Integrations() {
  const [, navigate] = useLocation()
  const [state, dispatch] = useReducer(integrationsReducer, {
    cursor: null,
    validateDialogOpen: false,
    providerToValidate: null,
    deleteDialogOpen: false,
    providerToDelete: null,
  })
  const { cursor, validateDialogOpen, providerToValidate, deleteDialogOpen, providerToDelete } = state

  const query = toolProvidersClient.useQuery('get', '/tool_providers', {
    params: {
      query: {
        cursor: cursor ?? undefined,
        limit: 20,
        include_total: true,
      },
    },
  })
  const {
    search,
    setSearch,
    items: filteredResults,
  } = useFuse<ToolProvider>(query.data?.resources ?? [], [{ name: 'name' }])
  const { showAlert } = useAlerts()

  const { activeSortIndex, getSortParams, sortData } = useTableSort({
    initialSortIndex: 0,
    initialDirection: 'asc',
  })

  // Sort the filtered results
  const results = sortData(filteredResults, (provider) => {
    switch (activeSortIndex) {
      case 0:
        return provider.name ?? ''
      case 1:
        return provider.status ?? ''
      case 2:
        return (provider.configuration as { provider_type?: string }).provider_type ?? ''
      case 3:
        return (provider as { tool_count?: number }).tool_count ?? 0
      default:
        return provider.name ?? ''
    }
  })

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
          dispatch({ type: 'CLOSE_VALIDATE_DIALOG' })
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
          dispatch({ type: 'CLOSE_DELETE_DIALOG' })
        },
      }
    )
  }

  // Row actions for PF ActionsColumn
  const getRowActions = (provider: ToolProvider): IAction[] => [
    {
      title: <IconLabel icon={<RhUiViewIcon />}>View and enable/disable tools</IconLabel>,
      onClick: () => navigate(`/configuration/integrations/${provider.id}/tools`),
    },
    {
      title: <IconLabel icon={<RhUiCheckCircleIcon />}>Validate connection</IconLabel>,
      onClick: () => {
        dispatch({ type: 'OPEN_VALIDATE_DIALOG', payload: provider })
      },
    },
    { isSeparator: true },
    {
      title: <IconLabel icon={<RhUiTrashIcon />}>Uninstall</IconLabel>,
      onClick: () => {
        dispatch({ type: 'OPEN_DELETE_DIALOG', payload: provider })
      },
    },
  ]

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
            Add integration
          </Button>
        </AppPageHeader>
      )}
      {results.length === 0 ? (
        search ? (
          <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
            <CompassPanel isFullHeight>
              <EmptyStateFilter clearAllFilters={() => setSearch('')} imageSrc={noResultsImage} imageAlt="No results" />
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
            onPrev: () => dispatch({ type: 'SET_CURSOR', payload: query.data?.prev ?? null }),
            onNext: () => dispatch({ type: 'SET_CURSOR', payload: query.data?.next ?? null }),
          }}
        >
          <Thead>
            <Tr>
              <Th sort={getSortParams(0)}>Name</Th>
              <Th sort={getSortParams(1)}>Status</Th>
              <Th sort={getSortParams(2)}>Integration type</Th>
              <Th sort={getSortParams(3)}>Tools</Th>
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
      )}
      <Modal
        isOpen={validateDialogOpen}
        onClose={() => dispatch({ type: 'SET_VALIDATE_DIALOG', payload: false })}
        variant="small"
      >
        <ModalHeader title="Validate integration" />
        <ModalBody>Are you sure you want to validate the connection for "{providerToValidate?.name}"?</ModalBody>
        <ModalFooter>
          <Button variant="primary" onClick={handleValidate}>
            Validate
          </Button>
          <Button variant="link" onClick={() => dispatch({ type: 'SET_VALIDATE_DIALOG', payload: false })}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
      <Modal
        isOpen={deleteDialogOpen}
        onClose={() => dispatch({ type: 'SET_DELETE_DIALOG', payload: false })}
        variant="small"
      >
        <ModalHeader title="Delete integration" />
        <ModalBody>Are you sure you want to delete "{providerToDelete?.name}"? This action cannot be undone.</ModalBody>
        <ModalFooter>
          <Button variant="danger" onClick={handleDelete}>
            Delete
          </Button>
          <Button variant="link" onClick={() => dispatch({ type: 'SET_DELETE_DIALOG', payload: false })}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </AppPage>
  )
}
