import type { ExecutionsAPI } from '@ansible/nexus-contracts'
import {
  Button,
  CompassPanel,
  Flex,
  FlexItem,
  Label,
  Stack,
  StackItem,
  Title,
  TitleSizes,
} from '@patternfly/react-core'
import { useQueryClient } from '@tanstack/react-query'
import '@xyflow/react/dist/style.css'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useParams, useSearch } from 'wouter'

import { AppPage } from '../../app/AppPage'
import { AppPageHeader } from '../../app/AppPageHeader'
import { executionsClient } from '../../client'
import { ConnectionBanner } from '../../components/ConnectionBanner'
import { ErrorState } from '../../components/states/ErrorState'
import { LoadingState } from '../../components/states/LoadingState'
import type { FilterConfig } from '../../types/filters'
import { detachPromise } from '../../utils/detachPromise'
import { buildFilterParams } from '../../utils/filterUtils'
import { useExecutionWebSocket } from '../automations/hooks/useExecutionWebSocket'
import { useExecutionStore } from '../automations/stores/useExecutionStore'
import { AutomationHistoryCard } from '../builder/AutomationHistoryCard'
import { ExecutionDetailsPanel, type WorkflowDefShape } from '../builder/ExecutionDetailsPanel'
import { StatusLabel } from '../builder/ExecutionStatus'
import { ExecutionViewContent } from '../builder/ExecutionViewContent'
import { formatHistoryDateTime } from '../builder/historyDateUtils'
import { RunHistoryToggleButton } from '../builder/RunHistoryToggleButton'

type Execution = ExecutionsAPI.components['schemas']['Execution']
type ActivityData = ExecutionsAPI.components['schemas']['ActivityData']
type ActivityExecution = ExecutionsAPI.components['schemas']['ActivityExecution']

interface WorkflowDefinitionLike {
  metadata?: { name?: string; description?: string }
  workflow?: { activities?: Array<{ id: string }> }
  triggers?: unknown[]
}

interface ExecutionWorkflow {
  id: string
  name: string
  description?: string
  version: { workflow_definition: WorkflowDefShape | null }
}

// Inner component that has access to React Flow context
function ExecutionDetailContent({
  historyCardOpen,
  workflow,
  execution,
  activities,
  executionId,
  executionsQuery,
  searchParams,
  setLocation,
  filters,
  onFilterChange,
}: {
  historyCardOpen: boolean
  workflow?: ExecutionWorkflow
  execution: Execution | undefined
  activities: (ActivityData | ActivityExecution)[]
  executionId: string
  executionsQuery: {
    data?: { resources?: Execution[] }
    isLoading: boolean
    error: unknown
    refetch: () => Promise<unknown>
  }
  searchParams: string
  setLocation: (path: string) => void
  filters: FilterConfig[]
  onFilterChange: (filters: FilterConfig[]) => void
}) {
  const isStale = useExecutionStore((state) => state.isStale)
  const isComplete = useExecutionStore((state) => state.isComplete)

  return (
    <Flex
      alignItems={{ default: 'alignItemsStretch' }}
      flexWrap={{ default: 'nowrap' }}
      gap={{ default: 'gapSm' }}
      style={{
        position: 'relative',
        minWidth: 0,
        height: '100%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'row',
      }}
    >
      <FlexItem
        style={{
          position: 'relative',
          minWidth: 0,
          flexGrow: 1,
          height: '100%',
          overflow: 'hidden',
        }}
      >
        {isStale && !isComplete && (
          <Flex
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              zIndex: 10,
              padding: 'var(--pf-t--global--spacer--md)',
              pointerEvents: 'auto',
            }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <FlexItem fullWidth={{ default: 'fullWidth' }}>
              <ConnectionBanner isVisible />
            </FlexItem>
          </Flex>
        )}
        <Stack style={{ height: '100%', overflow: 'hidden', gap: 'var(--pf-t--global--spacer--sm)' }}>
          {/* Workflow Canvas - use ExecutionViewContent for read-only viewing */}
          <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
            <ExecutionViewContent
              workflow={workflow}
              executionStatus={execution?.status ?? null}
              executionActivities={activities}
              executionId={executionId}
            />
          </StackItem>

          {/* Execution Details Panel */}
          <StackItem style={{ flexShrink: 0, height: '300px' }}>
            <ExecutionDetailsPanel
              executionId={executionId}
              workflowDefinition={workflow?.version.workflow_definition}
            />
          </StackItem>
        </Stack>
      </FlexItem>

      {/* History Card Panel */}
      {historyCardOpen && (
        <FlexItem style={{ flexShrink: 0, alignSelf: 'stretch' }}>
          <AutomationHistoryCard
            executions={executionsQuery.data?.resources ?? []}
            selectedExecutionId={executionId}
            onClose={() => {
              const params = new URLSearchParams(searchParams)
              params.set('history', 'closed')
              setLocation(`/executions/${executionId}?${params.toString()}`)
            }}
            onExecutionSelect={(selectedId) => {
              // Preserve history panel state when navigating to different execution
              const params = new URLSearchParams(searchParams)
              const newSearch = params.toString()
              const searchSuffix = newSearch ? `?${newSearch}` : ''
              setLocation(`/executions/${selectedId}${searchSuffix}`)
            }}
            filters={filters}
            onFilterChange={onFilterChange}
          />
        </FlexItem>
      )}
    </Flex>
  )
}

// eslint-disable-next-line complexity
export default function ExecutionDetail() {
  const params = useParams<{ executionId: string }>()
  const executionId = params.executionId
  const [, setLocation] = useLocation()
  const searchParams = useSearch()
  const queryClient = useQueryClient()

  // Use execution store
  const { setActivityExecutions, reset } = useExecutionStore.getState()

  // Reset execution store when executionId changes
  // This ensures WebSocket can reconnect for new executions
  useEffect(() => {
    if (executionId) {
      reset()
    }
  }, [executionId, reset])

  // Fetch execution with workflow_definition and activities included
  const executionQuery = executionsClient.useQuery('get', '/executions/{execution_id}', {
    params: {
      path: { execution_id: executionId ?? '' },
      query: {
        include: 'workflow_definition,activities',
      },
    },
    enabled: !!executionId,
  })

  const execution = executionQuery.data

  // Connect to WebSocket for real-time updates (only for running/pending executions)
  const shouldStream = execution?.status === 'running' || execution?.status === 'pending'
  useExecutionWebSocket(executionId ?? '', {
    enabled: shouldStream && !!executionId,
    onExecutionComplete: () => {
      // Invalidate all execution queries to refresh:
      // - ExecutionDetail header status
      // - ExecutionDetailsPanel (bottom panel)
      // - WorkflowHistoryCard (run history)
      detachPromise(
        Promise.all([
          queryClient.invalidateQueries({
            queryKey: ['get', '/executions/{execution_id}'],
          }),
          queryClient.invalidateQueries({
            queryKey: ['get', '/executions'],
          }),
        ])
      )
    },
  })

  // History panel is open by default; only closed when explicitly set via URL param
  const historyCardOpen = useMemo(() => {
    const params = new URLSearchParams(searchParams)
    return params.get('history') !== 'closed'
  }, [searchParams])

  const [executionFilters, setExecutionFilters] = useState<FilterConfig[]>([])

  // Fetch executions for this workflow
  const executionsQueryParams = useMemo(() => {
    const params: Record<string, unknown> = { workflow_id: execution?.workflow_id ?? '' }
    Object.assign(params, buildFilterParams(executionFilters))
    return params
  }, [execution?.workflow_id, executionFilters])

  const executionsQuery = executionsClient.useQuery(
    'get',
    '/executions',
    {
      params: { query: executionsQueryParams },
    },
    {
      enabled: !!execution?.workflow_id,
    }
  )

  const activities = useMemo((): (ActivityData | ActivityExecution)[] => {
    return execution?.activities ?? []
  }, [execution])

  // Update execution store when activities change
  useEffect(() => {
    if (activities.length > 0) {
      setActivityExecutions(activities)
    } else if (execution?.status === 'pending' || execution?.status === 'running') {
      const wfDef = execution?.workflow_definition as unknown as WorkflowDefinitionLike | undefined
      const workflowActivities = wfDef?.workflow?.activities
      if (workflowActivities) {
        const pendingActivities = workflowActivities.map((activity) => ({
          id: activity.id,
          created_at: '',
          updated_at: '',
          activity_name: activity.id,
          activity_id: activity.id,
          status: 'pending' as const,
          error_details: null,
          started_at: null,
          completed_at: null,
        })) as ActivityExecution[]
        setActivityExecutions(pendingActivities)
      }
    } else {
      setActivityExecutions([])
    }
  }, [activities, execution?.status, execution?.workflow_definition, setActivityExecutions])

  // Build a workflow object from the execution's workflow_definition
  const workflow = useMemo(() => {
    if (!execution?.workflow_definition || !execution.workflow_id) return undefined

    const wfDef = execution.workflow_definition as unknown as WorkflowDefinitionLike
    return {
      id: execution.workflow_id,
      name: wfDef.metadata?.name ?? 'Workflow',
      description: wfDef.metadata?.description,
      version: {
        workflow_definition: execution.workflow_definition,
      },
    }
  }, [execution])

  // Guard against missing executionId
  if (!executionId) {
    return (
      <AppPage>
        <AppPageHeader title="Error" />
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel isFullHeight>
            <ErrorState title="Invalid execution" message="No execution ID provided" />
          </CompassPanel>
        </StackItem>
      </AppPage>
    )
  }

  // Show loading/error states
  if (executionQuery.error) {
    return (
      <AppPage>
        <AppPageHeader title="Error loading execution" />
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel isFullHeight>
            <ErrorState title="Error loading execution" message={executionQuery.error} />
          </CompassPanel>
        </StackItem>
      </AppPage>
    )
  }

  if (executionQuery.isLoading) {
    return (
      <AppPage>
        <AppPageHeader title="Loading execution" />
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel isFullHeight>
            <LoadingState />
          </CompassPanel>
        </StackItem>
      </AppPage>
    )
  }

  // Toggle history panel and update URL
  const toggleHistoryCard = () => {
    const params = new URLSearchParams(searchParams)
    params.set('history', historyCardOpen ? 'closed' : 'open')
    setLocation(`/executions/${executionId}?${params.toString()}`)
  }

  const wfDefMeta = (execution?.workflow_definition as unknown as WorkflowDefinitionLike | undefined)?.metadata
  const pageTitle = (
    <Flex gap={{ default: 'gapMd' }} alignItems={{ default: 'alignItemsCenter' }}>
      <FlexItem>
        <Title headingLevel="h1" size={TitleSizes['2xl']}>
          {wfDefMeta?.name ?? `Execution ${executionId.slice(0, 8)}...`}
        </Title>
      </FlexItem>
      {execution?.status && (
        <FlexItem>
          <StatusLabel status={execution.status} />
        </FlexItem>
      )}
      {execution?.created_at && (
        <FlexItem>
          <Label>{`Viewing run: ${formatHistoryDateTime(execution.created_at)}`}</Label>
        </FlexItem>
      )}
    </Flex>
  )

  return (
    <AppPage>
      <AppPageHeader title={pageTitle}>
        <RunHistoryToggleButton onClick={toggleHistoryCard} isActive={historyCardOpen} />
        <Button
          variant="primary"
          onClick={() => execution?.workflow_id && setLocation(`/workflow-builder/${execution.workflow_id}`)}
        >
          Back to editor
        </Button>
      </AppPageHeader>
      <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
        <ExecutionDetailContent
          key={executionId}
          historyCardOpen={historyCardOpen}
          workflow={workflow}
          execution={execution}
          activities={activities}
          executionId={executionId}
          executionsQuery={executionsQuery}
          searchParams={searchParams}
          setLocation={setLocation}
          filters={executionFilters}
          onFilterChange={setExecutionFilters}
        />
      </StackItem>
    </AppPage>
  )
}
