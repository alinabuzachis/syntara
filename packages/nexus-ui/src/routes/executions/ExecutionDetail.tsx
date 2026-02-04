import type { WorkflowAPI } from '@ansible/nexus-contracts'
import {
  Button,
  CompassPanel,
  Flex,
  FlexItem,
  Icon,
  Stack,
  StackItem,
  Title,
  TitleSizes,
  Tooltip,
} from '@patternfly/react-core'
import { RhUiHistoryIcon, RhUiCloseIcon } from '@patternfly/react-icons'
import { useQueryClient } from '@tanstack/react-query'
import '@xyflow/react/dist/style.css'
import { useEffect, useMemo } from 'react'
import { useLocation, useParams, useSearch } from 'wouter'

import { AppPage } from '../../app/AppPage'
import { AppPageHeader } from '../../app/AppPageHeader'
import { workflowClient } from '../../client'
import { ConnectionBanner } from '../../components/ConnectionBanner'
import { ErrorState } from '../../components/states/ErrorState'
import { LoadingState } from '../../components/states/LoadingState'
import { useExecutionWebSocket } from '../automations/hooks/useExecutionWebSocket'
import { useExecutionStore } from '../automations/stores/useExecutionStore'
import { AutomationHistoryCard } from '../builder/AutomationHistoryCard'
import { ExecutionDetailsPanel } from '../builder/ExecutionDetailsPanel'
import { StatusLabel } from '../builder/ExecutionStatus'
import { ExecutionViewContent } from '../builder/ExecutionViewContent'

type Execution = WorkflowAPI.components['schemas']['Execution']
type ActivityExecution = WorkflowAPI.components['schemas']['ActivityExecution']

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
}: {
  historyCardOpen: boolean
  workflow: { id: string; name: string; description?: string; version: { workflow_definition: unknown } } | undefined
  execution: Execution | undefined
  activities: ActivityExecution[]
  executionId: string
  executionsQuery: { data?: { resources?: unknown[] }; isLoading: boolean; error: unknown }
  searchParams: string
  setLocation: (path: string) => void
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
            <ExecutionDetailsPanel executionId={executionId} />
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
              params.delete('history')
              const newSearch = params.toString()
              setLocation(`/executions/${executionId}${newSearch ? `?${newSearch}` : ''}`)
            }}
            onExecutionSelect={(selectedExecutionId) => {
              // Preserve history panel state when navigating to different execution
              const params = new URLSearchParams(searchParams)
              const newSearch = params.toString()
              setLocation(`/executions/${selectedExecutionId}${newSearch ? `?${newSearch}` : ''}`)
            }}
          />
        </FlexItem>
      )}
    </Flex>
  )
}

export default function ExecutionDetail() {
  const params = useParams<{ executionId: string }>()
  const executionId = params.executionId!
  const [, setLocation] = useLocation()
  const searchParams = useSearch()
  const queryClient = useQueryClient()

  // Use execution store
  const { setActivityExecutions, reset } = useExecutionStore.getState()

  // Reset execution store when executionId changes
  // This ensures WebSocket can reconnect for new executions
  useEffect(() => {
    reset()
  }, [executionId, reset])

  // Fetch execution with workflow_definition and activities included
  const executionQuery = workflowClient.useQuery('get', '/executions/{execution_id}', {
    params: {
      path: { execution_id: executionId },
      query: {
        include: 'workflow_definition,activities',
      },
    },
  })

  const execution = executionQuery.data as Execution | undefined

  // Connect to WebSocket for real-time updates (only for running/pending executions)
  const shouldStream = execution?.status === 'running' || execution?.status === 'pending'
  useExecutionWebSocket(executionId, {
    enabled: shouldStream,
    onExecutionComplete: () => {
      // Invalidate all execution queries to refresh:
      // - ExecutionDetail header status
      // - ExecutionDetailsPanel (bottom panel)
      // - AutomationHistoryCard (run history)
      void queryClient.invalidateQueries({
        queryKey: ['get', '/executions/{execution_id}'],
      })
      void queryClient.invalidateQueries({
        queryKey: ['get', '/executions'],
      })
    },
  })

  // Derive historyCardOpen from URL search params
  const historyCardOpen = useMemo(() => {
    const params = new URLSearchParams(searchParams)
    return params.get('history') === 'open'
  }, [searchParams])

  // Fetch executions for this workflow
  const executionsQuery = workflowClient.useQuery(
    'get',
    '/executions',
    {
      params: {
        query: {
          workflow_id: execution?.workflow_id ?? '',
        },
      },
    },
    {
      enabled: !!execution?.workflow_id,
    }
  )

  const activities = useMemo(() => {
    return (execution?.activities as ActivityExecution[]) ?? []
  }, [execution])

  // Update execution store when activities change
  useEffect(() => {
    if (activities.length > 0) {
      setActivityExecutions(activities)
    } else if (execution?.workflow_definition?.workflow?.activities) {
      // If no activity executions yet, create pending states for all activities in the workflow
      const workflowActivities = execution.workflow_definition.workflow.activities as Array<{ id: string }>
      const pendingActivities: ActivityExecution[] = workflowActivities.map((activity) => ({
        activity_id: activity.id,
        status: 'pending' as const,
        error_details: null,
        started_at: null,
        completed_at: null,
      }))
      setActivityExecutions(pendingActivities)
    }
  }, [activities, execution?.workflow_definition, setActivityExecutions])

  // Build a workflow object from the execution's workflow_definition
  const workflow = useMemo(() => {
    if (!execution?.workflow_definition) return undefined

    return {
      id: execution.workflow_id,
      name: execution.workflow_definition.metadata?.name ?? 'Workflow',
      description: execution.workflow_definition.metadata?.description,
      version: {
        workflow_definition: execution.workflow_definition,
      },
    }
  }, [execution])

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
    if (historyCardOpen) {
      params.delete('history')
    } else {
      params.set('history', 'open')
    }
    const newSearch = params.toString()
    setLocation(`/executions/${executionId}${newSearch ? `?${newSearch}` : ''}`)
  }

  const pageTitle = (
    <Flex gap={{ default: 'gapMd' }} alignItems={{ default: 'alignItemsCenter' }}>
      <FlexItem>
        <Title headingLevel="h1" size={TitleSizes['2xl']}>
          {execution?.workflow_definition?.metadata?.name ?? `Execution ${executionId.slice(0, 8)}...`}
        </Title>
      </FlexItem>
      {execution?.status && (
        <FlexItem>
          <StatusLabel status={execution.status} />
        </FlexItem>
      )}
    </Flex>
  )

  return (
    <AppPage>
      <AppPageHeader title={pageTitle}>
        <Tooltip content="Run history">
          <Button
            variant="plain"
            onClick={toggleHistoryCard}
            icon={
              <Icon isInline>
                <RhUiHistoryIcon />
              </Icon>
            }
            aria-label="Run history"
          />
        </Tooltip>
        <Tooltip content="Close and open in automation builder">
          <Button
            variant="plain"
            onClick={() => setLocation(`/automation-builder/${execution?.workflow_id}`)}
            icon={
              <Icon isInline>
                <RhUiCloseIcon />
              </Icon>
            }
            aria-label="Close"
          />
        </Tooltip>
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
        />
      </StackItem>
    </AppPage>
  )
}
