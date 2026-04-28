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
} from '@patternfly/react-core'
import { RhUiHistoryIcon, RhUiCloseIcon } from '@patternfly/react-icons'
import { useMemo, type CSSProperties, type ReactNode } from 'react'

import pageMainSlotStyles from '../../app/AppPage.module.css'
import { AppPanel } from '../../components/AppPanel'
import { EmptyStateFilter } from '../../components/EmptyStateFilter'
import { FilterBar } from '../../components/filters/FilterBar'
import { useElapsedTime } from '../../hooks/useElapsedTime'
import type { FilterConfig, FilterFieldDefinition } from '../../types/filters'
import { formatElapsedTime } from '../../utils/dateUtils'
import { getExecutionStatusFilterDefinition } from '../executions/executionFilters'

import { StatusLabel } from './ExecutionStatus'
import { formatHistoryDateTime, getDateGroupLabel } from './historyDateUtils'

type Execution = ExecutionsAPI.components['schemas']['Execution']

const TRUNCATED_ID_LENGTH = 8 // First 8 chars of UUID provide sufficient uniqueness

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

export function ExecutionHistoryRow({ execution, onSelect, isSelected }: ExecutionHistoryRowProps) {
  const isRunning = execution.status === 'running'
  const startedAtValue = execution.started_at ?? execution.created_at ?? null
  const { elapsedMs } = useElapsedTime(startedAtValue, execution.completed_at, isRunning)
  const elapsedLabel = elapsedMs !== undefined ? `Elapsed time: ${formatElapsedTime(elapsedMs)}` : 'Elapsed time: -'
  const truncatedId = execution.id ? execution.id.slice(0, TRUNCATED_ID_LENGTH) : null

  return (
    <SimpleListItem itemId={execution.id} isActive={isSelected} onClick={onSelect}>
      <Flex
        justifyContent={{ default: 'justifyContentSpaceBetween' }}
        alignItems={{ default: 'alignItemsFlexStart' }}
        gap={{ default: 'gapSm' }}
        fullWidth={{ default: 'fullWidth' }}
      >
        <FlexItem>
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
          </Stack>
        </FlexItem>
        <FlexItem style={{ flexShrink: 0 }}>{execution.status && <StatusLabel status={execution.status} />}</FlexItem>
      </Flex>
    </SimpleListItem>
  )
}

type AutomationHistoryCardProps = {
  executions: Execution[]
  onClose: () => void
  onExecutionSelect: (executionId: string) => void
  selectedExecutionId?: string | null
  filters?: FilterConfig[]
  onFilterChange?: (filters: FilterConfig[]) => void
}

const HISTORY_FILTER_FIELDS: FilterFieldDefinition[] = [getExecutionStatusFilterDefinition()]

export function AutomationHistoryCard(props: AutomationHistoryCardProps) {
  const { executions, onClose, onExecutionSelect, selectedExecutionId, filters = [], onFilterChange } = props

  const groups = useMemo(() => groupExecutionsByDate(executions), [executions])

  const simpleListStyle = {
    paddingBottom: 'var(--pf-t--global--spacer--lg)',
    '--pf-v6-c-simple-list__item-link--PaddingBlockStart': 'var(--pf-t--global--spacer--md)',
    '--pf-v6-c-simple-list__item-link--PaddingBlockEnd': 'var(--pf-t--global--spacer--md)',
    '--pf-v6-c-simple-list__item-link--PaddingInlineStart': 'var(--pf-t--global--spacer--xl)',
    '--pf-v6-c-simple-list__item-link--PaddingInlineEnd': 'var(--pf-t--global--spacer--lg)',
  } as CSSProperties

  let executionListBody: ReactNode
  if (executions.length === 0 && filters.length > 0) {
    executionListBody = <EmptyStateFilter clearAllFilters={onFilterChange ? () => onFilterChange([]) : undefined} />
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
    <AppPanel
      hasNoPadding
      isFullHeight
      style={{
        height: '100%',
        maxHeight: '100%',
        width: '20rem',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <Stack style={{ height: '100%', minHeight: 0 }}>
          <StackItem
            style={{
              flexShrink: 0,
              padding:
                'var(--pf-t--global--spacer--lg) var(--pf-t--global--spacer--md) var(--pf-t--global--spacer--md)',
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
                <Button variant="plain" onClick={onClose} aria-label="Close">
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
                fieldDefinitions={HISTORY_FILTER_FIELDS}
                filters={filters}
                onFilterChange={onFilterChange}
                isCompact
              />
            </StackItem>
          )}

          <StackItem isFilled className={pageMainSlotStyles.main} style={{ overflowY: 'auto', overflowX: 'hidden' }}>
            {executionListBody}
          </StackItem>
        </Stack>
      </div>
    </AppPanel>
  )
}
