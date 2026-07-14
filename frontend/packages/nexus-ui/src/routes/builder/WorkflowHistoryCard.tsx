import type { ExecutionsAPI } from '@ansible/nexus-contracts'
import {
  Button,
  Content,
  ContentVariants,
  Divider,
  Flex,
  FlexItem,
  Icon,
  SimpleList,
  SimpleListGroup,
  SimpleListItem,
  Stack,
  StackItem,
  Title,
  TitleSizes,
  Truncate,
} from '@patternfly/react-core'
import { RhUiCloseIcon, RhUiHistoryIcon, RhUiRedoIcon } from '@patternfly/react-icons'
import React, { useMemo, useState, type CSSProperties, type ReactNode } from 'react'

import { FilterBar } from '../../components/filters/FilterBar'
import { IconLabel } from '../../components/IconLabel'
import { ApprovalPendingBadge } from '../../components/labels/ApprovalPendingBadge'
import { NxLabel } from '../../components/labels/NxLabel'
import { NxPanel } from '../../components/layout/NxPanel'
import type { KebabAction } from '../../components/NxKebabMenu'
import { NxKebabMenu } from '../../components/NxKebabMenu'
import { NxEmptyStateFilter } from '../../components/states/NxEmptyStateFilter'
import type { PaginationFooterProps } from '../../components/table/PaginationFooter'
import { PaginationFooter } from '../../components/table/PaginationFooter'
import { permissionTooltip } from '../../hooks/permissionUtils'
import { Link } from '../../hooks/routing/Link'
import { useNavigate } from '../../hooks/routing/useNavigate'
import { useCanI } from '../../hooks/useCanI'
import { useElapsedTime } from '../../hooks/useElapsedTime'
import type { FilterConfig, FilterFieldDefinition } from '../../types/filters'
import { formatDateTime, formatElapsedTime } from '../../utils/dateUtils'
import {
  getExecutionStatusFilterDefinition,
  getExecutionVersionFilterFromExecutions,
} from '../executions/executionFilters'
import { isExecutionRetryable } from '../executions/executionRetryable'
import { useIsCurrentVersion } from '../executions/hooks/useIsCurrentVersion'
import { RetryExecutionDialog } from '../executions/RetryExecutionDialog'
import { useRetryExecution } from '../executions/useRetryExecution'
import type { ExecutionMetadata } from '../workflows/stores/useExecutionStore'

import { StatusLabel } from './ExecutionStatus'
import { formatHistoryDateTime, getDateGroupLabel } from './historyDateUtils'

type Execution = ExecutionsAPI.components['schemas']['ExecutionRead']

const TRUNCATED_ID_LENGTH = 8 // First 8 chars of UUID provide sufficient uniqueness
const historyRetryTooltip = permissionTooltip('retry this execution', 'execution:run')

type ExecutionGroup = {
  label: string
  items: Execution[]
}

function groupExecutionsByDate(executions: Execution[]): ExecutionGroup[] {
  const map = new Map<string, Execution[]>()
  for (const exec of executions) {
    const label = exec.created_at ? getDateGroupLabel(exec.created_at) : 'Unknown'
    if (!map.has(label)) map.set(label, [])
    map.get(label)!.push(exec)
  }
  return Array.from(map.entries()).map(([label, items]) => ({ label, items }))
}

type ExecutionHistoryRowProps = {
  execution: Execution
  onSelect: () => void
  isSelected?: boolean
}

function HistoryRowRetryAction({ execution }: Readonly<{ execution: Execution }>) {
  const [retryDialogOpen, setRetryDialogOpen] = useState(false)
  const navigate = useNavigate()
  const truncatedId = execution.id ? execution.id.slice(0, TRUNCATED_ID_LENGTH) : null

  /* v8 ignore start -- v8 emits phantom branches from compiled hook destructuring */
  const { allowed: canRun, isChecking } = useCanI('run', 'execution')
  const {
    isCurrentVersion,
    versionLabel,
    isLoading: isVersionLoading,
  } = useIsCurrentVersion(execution.workflow_id, execution.workflow_version_id, retryDialogOpen)
  const retryHook = useRetryExecution(execution.id, (newId) => {
    setRetryDialogOpen(false)
    navigate(`/executions/${newId}`)
  })
  /* v8 ignore stop */

  const kebabActions: KebabAction[] = [
    {
      key: 'retry',
      title: <IconLabel icon={<RhUiRedoIcon />}>Retry run</IconLabel>,
      isAriaDisabled: !canRun || isChecking,
      tooltipProps: !canRun && !isChecking ? { content: historyRetryTooltip } : undefined,
      onClick: () => setRetryDialogOpen(true),
    },
  ]

  return (
    <>
      <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="presentation">
        <NxKebabMenu aria-label={`Actions for execution ${truncatedId ?? execution.id}`} actions={kebabActions} />
      </div>
      <RetryExecutionDialog
        isOpen={retryDialogOpen}
        onClose={() => setRetryDialogOpen(false)}
        onConfirm={retryHook.handleRetry}
        confirmLoading={retryHook.isPending || isVersionLoading}
        isCurrentVersion={isCurrentVersion}
        isVersionLoading={isVersionLoading}
        versionLabel={versionLabel}
      />
    </>
  )
}

export function ExecutionHistoryRow({ execution, onSelect, isSelected }: ExecutionHistoryRowProps) {
  const isRunning = execution.status === 'running'
  const startedAtValue = execution.created_at ?? null
  const { elapsedMs } = useElapsedTime(startedAtValue, execution.completed_at, isRunning)
  const elapsedLabel = elapsedMs !== undefined ? `Elapsed time: ${formatElapsedTime(elapsedMs)}` : 'Elapsed time: -'
  const truncatedId = execution.id ? execution.id.slice(0, TRUNCATED_ID_LENGTH) : null
  const isTestRun = (execution as { execution_metadata?: ExecutionMetadata }).execution_metadata?.mode === 'test'
  const retryable = isExecutionRetryable(execution.status, execution.mode)

  return (
    <SimpleListItem itemId={execution.id} isActive={isSelected} onClick={onSelect}>
      <Flex
        justifyContent={{ default: 'justifyContentSpaceBetween' }}
        alignItems={{ default: 'alignItemsFlexStart' }}
        gap={{ default: 'gapSm' }}
      >
        <FlexItem flex={{ default: 'flex_1' }} style={{ minWidth: 0 }}>
          <Stack style={{ gap: 'var(--pf-t--global--spacer--sm)' }}>
            {execution.created_at && (
              <Content component={ContentVariants.p} style={{ whiteSpace: 'nowrap', fontWeight: 600, margin: 0 }}>
                {formatHistoryDateTime(execution.created_at)}
              </Content>
            )}
            <Content component={ContentVariants.small} style={{ margin: 0 }}>
              {elapsedLabel}
            </Content>
            {truncatedId && (
              <Content component={ContentVariants.small} style={{ margin: 0 }}>{`Run ID: ${truncatedId}`}</Content>
            )}
            {execution.workflow_version != null && execution.workflow_id && (
              <Content component={ContentVariants.small} style={{ margin: 0 }}>
                {'Version: '}
                <Link
                  href={`/workflow-builder/${execution.workflow_id}?version=${String(execution.workflow_version)}`}
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                >
                  <Truncate
                    content={
                      execution.workflow_version_publish_name ?? formatDateTime(execution.workflow_version_created_at)
                    }
                  />
                </Link>
              </Content>
            )}
            {execution.retried_from_execution_id && (
              <Content component={ContentVariants.small} style={{ margin: 0, fontStyle: 'italic' }}>
                {`Retried from: ${execution.retried_from_execution_id.slice(0, TRUNCATED_ID_LENGTH)}`}
              </Content>
            )}
          </Stack>
        </FlexItem>
        <FlexItem style={{ flexShrink: 0, alignSelf: 'flex-start' }}>
          <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
            <Stack style={{ gap: 'var(--pf-t--global--spacer--sm)', alignItems: 'flex-end' }}>
              {execution.status && <StatusLabel status={execution.status} />}
              <ApprovalPendingBadge approvalPending={execution.approval_pending} />
              {isTestRun && <NxLabel color="purple">Test run</NxLabel>}
            </Stack>
            {retryable && <HistoryRowRetryAction execution={execution} />}
          </Flex>
        </FlexItem>
      </Flex>
    </SimpleListItem>
  )
}

type WorkflowHistoryCardProps = {
  executions: Execution[]
  onClose: () => void
  onExecutionSelect: (executionId: string) => void
  selectedExecutionId?: string | null
  filters?: FilterConfig[]
  onFilterChange?: (filters: FilterConfig[]) => void
  paginationFooterProps?: PaginationFooterProps
}

export function WorkflowHistoryCard(props: WorkflowHistoryCardProps) {
  const {
    executions,
    onClose,
    onExecutionSelect,
    selectedExecutionId,
    filters = [],
    onFilterChange,
    paginationFooterProps,
  } = props

  const historyFilterFields = useMemo(
    (): FilterFieldDefinition[] => [
      getExecutionStatusFilterDefinition(),
      getExecutionVersionFilterFromExecutions(executions),
    ],
    [executions]
  )

  const groups = useMemo(() => groupExecutionsByDate(executions), [executions])

  const simpleListStyle = {
    '--pf-v6-c-simple-list__item-link--PaddingBlockStart': 'var(--pf-t--global--spacer--md)',
    '--pf-v6-c-simple-list__item-link--PaddingBlockEnd': 'var(--pf-t--global--spacer--md)',
    '--pf-v6-c-simple-list__item-link--PaddingInlineStart': 'var(--pf-t--global--spacer--xl)',
    '--pf-v6-c-simple-list__item-link--PaddingInlineEnd': 'var(--pf-t--global--spacer--lg)',
  } as CSSProperties

  let executionListBody: ReactNode
  if (executions.length === 0 && filters.length > 0) {
    executionListBody = <NxEmptyStateFilter clearAllFilters={onFilterChange ? () => onFilterChange([]) : undefined} />
  } else if (executions.length === 0) {
    executionListBody = (
      <Content
        component={ContentVariants.p}
        style={{
          padding: 'var(--pf-t--global--spacer--md) var(--pf-t--global--spacer--lg)',
        }}
      >
        No execution history available
      </Content>
    )
  } else {
    executionListBody = (
      <SimpleList isControlled={false} aria-label="Run history list" style={simpleListStyle}>
        {groups.map(({ label, items }) => (
          <SimpleListGroup
            key={label}
            title={
              <Content
                component={ContentVariants.small}
                style={{
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--pf-t--global--text--color--subtle)',
                  margin: 0,
                }}
              >
                {label}
              </Content>
            }
          >
            {items.flatMap((execution) => [
              <ExecutionHistoryRow
                key={execution.id}
                execution={execution}
                onSelect={() => onExecutionSelect(execution.id)}
                isSelected={selectedExecutionId === execution.id}
              />,
              <Divider key={`${execution.id}-divider`} component="li" />,
            ])}
          </SimpleListGroup>
        ))}
      </SimpleList>
    )
  }

  return (
    <NxPanel
      hasNoPadding
      isFullHeight
      style={{
        width: '20rem',
        flexShrink: 0,
      }}
    >
      <Stack
        style={{
          height: '100%',
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          maxHeight: '100%',
          overflow: 'hidden',
          width: '100%',
        }}
      >
        <StackItem
          style={{
            flexShrink: 0,
            padding: 'var(--pf-t--global--spacer--lg) var(--pf-t--global--spacer--md) var(--pf-t--global--spacer--md)',
          }}
        >
          <Flex
            justifyContent={{ default: 'justifyContentSpaceBetween' }}
            alignItems={{ default: 'alignItemsFlexStart' }}
          >
            <FlexItem>
              <Stack hasGutter>
                <Flex gap={{ default: 'gapSm' }} alignItems={{ default: 'alignItemsCenter' }}>
                  <Icon>
                    <RhUiHistoryIcon />
                  </Icon>
                  <Title headingLevel="h2" size={TitleSizes.md}>
                    Run History
                  </Title>
                </Flex>
                <Content component={ContentVariants.small}>View past runs of this workflow.</Content>
              </Stack>
            </FlexItem>
            <FlexItem>
              <Button variant="plain" onClick={onClose} aria-label="Close run history">
                <Icon>
                  <RhUiCloseIcon />
                </Icon>
              </Button>
            </FlexItem>
          </Flex>
        </StackItem>

        {onFilterChange && (
          <StackItem style={{ flexShrink: 0, minWidth: 0, overflow: 'hidden' }}>
            <FilterBar
              fieldDefinitions={historyFilterFields}
              filters={filters}
              onFilterChange={onFilterChange}
              isCompact
            />
          </StackItem>
        )}

        <div
          style={{
            position: 'relative',
            flex: '1 1 auto',
            minHeight: 0,
            overflow: 'hidden',
            borderRadius: 'var(--pf-t--global--border--radius--medium)',
          }}
        >
          <div
            style={{
              minHeight: 0,
              height: '100%',
              overflow: 'auto',
              width: '100%',
              position: 'relative',
            }}
          >
            {executionListBody}
          </div>
        </div>

        {paginationFooterProps && (
          <StackItem
            style={{
              flex: '0 0 auto',
              width: '100%',
              borderTop:
                'var(--pf-t--global--border--width--divider--default) solid var(--pf-t--global--border--color--default)',
              paddingBottom: 'var(--pf-t--global--spacer--sm)',
            }}
          >
            <PaginationFooter {...paginationFooterProps} />
          </StackItem>
        )}
      </Stack>
    </NxPanel>
  )
}
