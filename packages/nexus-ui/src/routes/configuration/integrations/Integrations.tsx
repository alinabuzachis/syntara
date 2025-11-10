import type { ToolProvider } from '@ansible/nexus-contracts'
import {
  ConfirmDialog,
  EmptyStateFilter,
  Menu,
  MenuGroup,
  MenuItems,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
  Scrollable,
  useAlerts,
} from '@ansible/nexus-ui-framework'
import { CheckCircle2Icon, EllipsisVerticalIcon, EyeIcon, Loader2Icon, Trash2Icon, XCircleIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import { AppPage } from '../../../app/AppPage'
import { AppPageHeader } from '../../../app/AppPageHeader'
import { AppRoute } from '../../../app/AppRoute'
import { toolProvidersClient } from '../../../client'
import { ChatInput } from '../../../components/chat/ChatInput'
import { useQueryState } from '../../../components/states/useQueryState'
import { StringCell } from '../../../components/table/StringCell'
import { Table, type IRowAction } from '../../../components/table/Table'
import { useFuse } from '../../../hooks/useFuse'
import { IntegrationCard } from './IntegrationCard'
import { IntegrationEmptyState } from './IntegrationEmptyState'

type ProviderStatus = 'available' | 'error' | 'validating'

const statusIcons: Record<ProviderStatus, React.ComponentType<{ className?: string }>> = {
  available: CheckCircle2Icon,
  error: XCircleIcon,
  validating: Loader2Icon,
}

const statusColors: Record<ProviderStatus, string> = {
  available: 'text-green-400',
  error: 'text-red-400',
  validating: 'text-blue-400',
}

function StatusLabel({ status }: { status: string }) {
  const providerStatus = status as ProviderStatus
  const Icon = statusIcons[providerStatus] || XCircleIcon
  const colorClass = statusColors[providerStatus] || 'text-gray-400'
  const capitalizedStatus = status.charAt(0).toUpperCase() + status.slice(1)

  return (
    <div className={`flex items-center gap-1.5 ${colorClass}`}>
      <Icon className="size-4" />
      <span>{capitalizedStatus}</span>
    </div>
  )
}

export default function Integrations() {
  const [, navigate] = useLocation()
  const query = toolProvidersClient.useQuery('get', '/tool-providers', {})
  const { search, setSearch, items: results } = useFuse(query.data?.resources ?? [], [{ name: 'name' }])
  const { showAlert } = useAlerts()

  const [validateDialogOpen, setValidateDialogOpen] = useState(false)
  const [providerToValidate, setProviderToValidate] = useState<ToolProvider | null>(null)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [providerToDelete, setProviderToDelete] = useState<ToolProvider | null>(null)

  const { mutate: validateProvider } = toolProvidersClient.useMutation('post', '/tool-providers/{provider_id}/validate')
  const { mutate: deleteProvider } = toolProvidersClient.useMutation('delete', '/tool-providers/{provider_id}')

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
          query.refetch()
        },
        onError: (error) => {
          showAlert({
            title: 'Validation failed',
            description: `Failed to validate provider "${providerToValidate.name}": ${error.message}`,
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
          query.refetch()
        },
        onError: (error) => {
          showAlert({
            title: 'Delete failed',
            description: `Failed to delete integration "${providerToDelete.name}": ${error.message}`,
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

  const rowActions = useMemo<IRowAction<ToolProvider>[]>(
    () => [
      {
        label: 'View and enable/disable tools',
        icon: EyeIcon,
        onClick: (provider: ToolProvider) => {
          navigate(`/configuration/integrations/${provider.id}/tools`)
        },
      },
      {
        label: 'Validate connection',
        icon: CheckCircle2Icon,
        onClick: (provider: ToolProvider) => {
          setProviderToValidate(provider)
          setValidateDialogOpen(true)
        },
      },
      {
        label: 'Uninstall',
        icon: Trash2Icon,
        variant: 'destructive' as const,
        onClick: (provider: ToolProvider) => {
          setProviderToDelete(provider)
          setDeleteDialogOpen(true)
        },
      },
    ],
    [navigate]
  )

  const [view, setView] = useState<'table' | 'cards'>('table')

  const queryState = useQueryState(query, 'Error loading integrations')
  if (queryState) return queryState

  return (
    <AppPage>
      {query.data?.resources && query.data.resources.length > 0 && (
        <AppPageHeader title="Integrations">
          {/* <ExampleToggleGroup /> */}
          <input
            className="search grow"
            placeholder="Search integrations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            className="rounded-full bg-blue-400/70 px-4 py-1"
            onClick={() => navigate(AppRoute.Configuration.Integrations.Configure)}
          >
            Add Integration
          </button>
          <Menu>
            <MenuTrigger>
              <EllipsisVerticalIcon />
            </MenuTrigger>
            <MenuItems>
              <MenuGroup label="View">
                <MenuRadioGroup value={view} onValueChange={setView}>
                  <MenuRadioItem value="table">Table</MenuRadioItem>
                  <MenuRadioItem value="cards">Cards</MenuRadioItem>
                </MenuRadioGroup>
              </MenuGroup>
            </MenuItems>
          </Menu>
          {/* <ExampleToggleGroup /> */}
        </AppPageHeader>
      )}
      {view !== 'cards' ? (
        <Table
          items={results}
          rowActions={rowActions}
          keyFn={(item) => item.id}
          columns={[
            {
              id: 'name',
              label: 'Name',
              render: (item) => <StringCell>{item.name}</StringCell>,
            },
            {
              id: 'status',
              label: 'Status',
              render: (item) => <StatusLabel status={item.status} />,
            },
            {
              id: 'configuration',
              label: 'Integration type',
              render: (item) => <StringCell>{item.configuration.provider_type}</StringCell>,
            },
            {
              id: 'tool_count',
              label: 'Tools',
              render: (item) => <StringCell>{item.tool_count}</StringCell>,
            },
          ]}
          emptyState={search ? <EmptyStateFilter /> : <IntegrationEmptyState />}
        />
      ) : (
        <Scrollable className="glass grow rounded-4xl border">
          <div className={`grid grid-cols-[repeat(auto-fit,minmax(350px,1fr))] gap-4 p-8`}>
            {results.map((integration) => (
              <IntegrationCard key={integration.id} integration={integration} />
            ))}
          </div>
        </Scrollable>
      )}
      <ChatInput />
      <ConfirmDialog
        open={validateDialogOpen}
        onOpenChange={setValidateDialogOpen}
        title="Validate integration"
        description={`Are you sure you want to validate the connection for "${providerToValidate?.name}"?`}
        confirmLabel="Validate"
        onConfirm={handleValidate}
      />
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete integration"
        description={`Are you sure you want to delete "${providerToDelete?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />
    </AppPage>
  )
}
