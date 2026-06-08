import {
  Button,
  Content,
  ContentVariants,
  EmptyState,
  EmptyStateBody,
  Flex,
  FlexItem,
  SearchInput,
  Spinner,
  Stack,
  StackItem,
  Title,
  TitleSizes,
} from '@patternfly/react-core'
import { RhUiCloseIcon } from '@patternfly/react-icons'
import { useEffect, useMemo, useRef, useState } from 'react'

import { NxCodeBlock } from '../../components/details/NxCodeBlock'
import { NxErrorState } from '../../components/states/NxErrorState'
import { useElapsedTime } from '../../hooks/useElapsedTime'
import { formatExecutionDateTime, formatElapsedTime } from '../../utils/dateUtils'
import { detachPromise } from '../../utils/detachPromise'
import { highlightTextLines } from '../../utils/highlightText'
import { ActivityStatusLabel } from '../builder/ExecutionStatus'
import { InputSchemaView } from '../builder/panels/views/InputSchemaView'
import { InputTableView } from '../builder/panels/views/InputTableView'
import { ViewToggle, type PanelView } from '../builder/panels/ViewToggle'
import type { ActivityState } from '../workflows/execution/types'

import { useNodeExecutionDetails } from './hooks/useNodeExecutionDetails'

type NodeExecutionDetailsPanelProps = {
  nodeId: string
  nodeName: string
  executionId: string
  /** Activity state from the execution store, used for status and elapsed time. */
  nodeState?: ActivityState
  onClose: () => void
}

function NoDataState({ label }: Readonly<{ label: string }>) {
  return (
    <EmptyState headingLevel="h3" titleText={`No ${label} data`} variant="xs">
      <EmptyStateBody>No {label} data is available for this activity.</EmptyStateBody>
    </EmptyState>
  )
}

type DataPaneProps = {
  title: string
  nodeId: string
  data: Record<string, unknown> | null
  view: PanelView
  onViewChange: (view: PanelView) => void
  isErrorState?: boolean
}

function DataPane({ title, nodeId, data, view, onViewChange, isErrorState = false }: Readonly<DataPaneProps>) {
  const [searchTerm, setSearchTerm] = useState('')
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const jsonText = useMemo(() => (data ? JSON.stringify(data, null, 2) : ''), [data])

  const highlightedJson = useMemo(() => {
    if (!jsonText) return undefined
    return highlightTextLines(jsonText, searchTerm)
  }, [jsonText, searchTerm])

  useEffect(() => {
    if (searchTerm && scrollContainerRef.current) {
      const firstMark = scrollContainerRef.current.querySelector('mark')
      firstMark?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [searchTerm, view, highlightedJson])

  function renderContent() {
    if (!data) {
      return <NoDataState label={title.toLowerCase()} />
    }
    switch (view) {
      case 'schema':
        return <InputSchemaView data={data} nodeId={nodeId} searchTerm={searchTerm} />
      case 'table':
        return <InputTableView data={data} searchTerm={searchTerm} />
      case 'json':
        return (
          <div style={isErrorState ? { color: 'var(--pf-t--global--color--status--danger--default)' } : undefined}>
            <NxCodeBlock enableCopy enableExpand expandTitle={`${title} JSON`} noMaxHeight copyContent={jsonText}>
              {highlightedJson ?? jsonText}
            </NxCodeBlock>
          </div>
        )
    }
  }

  return (
    <Stack style={{ height: '100%', overflow: 'hidden' }}>
      <StackItem style={{ flexShrink: 0, paddingBottom: 'var(--pf-t--global--spacer--sm)' }}>
        <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }} flexWrap={{ default: 'nowrap' }}>
          <FlexItem style={{ fontWeight: 'var(--pf-t--global--font--weight--body--bold)', flexShrink: 0 }}>
            {title}
          </FlexItem>
          <FlexItem grow={{ default: 'grow' }} style={{ minWidth: 0 }}>
            <SearchInput
              aria-label={`Search ${title.toLowerCase()} data`}
              placeholder="Search"
              value={searchTerm}
              onChange={(_event, value) => setSearchTerm(value)}
              onClear={() => setSearchTerm('')}
            />
          </FlexItem>
          <FlexItem style={{ flexShrink: 0 }}>
            <ViewToggle activeView={view} onChange={onViewChange} ariaLabel={`${title} view selection`} />
          </FlexItem>
        </Flex>
      </StackItem>
      <StackItem isFilled style={{ minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
        <div ref={scrollContainerRef}>{renderContent()}</div>
      </StackItem>
    </Stack>
  )
}

/**
 * Renders a node details section with its own header (name, status, elapsed, close)
 * and side-by-side Input / Output data panes beneath it.
 */
export function NodeExecutionDetailsPanel({
  nodeId,
  nodeName,
  executionId,
  nodeState,
  onClose,
}: Readonly<NodeExecutionDetailsPanelProps>) {
  const [inputView, setPanelView] = useState<PanelView>('json')
  const [outputView, setOutputView] = useState<PanelView>('json')
  const { inputData, outputData, isLoading, error, refetch } = useNodeExecutionDetails(
    nodeId,
    executionId,
    nodeState?.status
  )

  const nodeStarted = nodeState?.startedAt ?? null
  const nodeCompleted = nodeState?.completedAt ?? null
  const nodeIsRunning = nodeState?.status === 'running'
  const nodeIsFailed = nodeState?.status === 'failed'
  const { elapsedMs } = useElapsedTime(nodeStarted, nodeCompleted, nodeIsRunning)
  const nodeElapsedLabel = elapsedMs === undefined ? undefined : formatElapsedTime(elapsedMs)

  return (
    <Stack style={{ height: '100%', overflow: 'hidden' }}>
      {/* Node-specific header */}
      <StackItem style={{ flexShrink: 0, paddingBottom: 'var(--pf-t--global--spacer--md)' }}>
        <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
          <FlexItem>
            <Title headingLevel="h2" size={TitleSizes.md} style={{ margin: 0 }}>
              {nodeName}
            </Title>
          </FlexItem>
          <FlexItem>
            <Flex gap={{ default: 'gapMd' }} alignItems={{ default: 'alignItemsCenter' }}>
              {nodeStarted && (
                <Content
                  component={ContentVariants.small}
                  style={{ color: 'var(--pf-t--global--text--color--subtle)', margin: 0 }}
                >
                  {formatExecutionDateTime(nodeStarted)}
                  {nodeCompleted && ` - ${formatExecutionDateTime(nodeCompleted)}`}
                </Content>
              )}
              {nodeElapsedLabel && (
                <Content
                  component={ContentVariants.small}
                  style={{ color: 'var(--pf-t--global--text--color--subtle)', margin: 0 }}
                >
                  Elapsed time: {nodeElapsedLabel}
                </Content>
              )}
              {nodeState?.status && (
                <FlexItem style={{ display: 'flex', alignItems: 'center' }}>
                  <ActivityStatusLabel status={nodeState.status} />
                </FlexItem>
              )}
              <FlexItem>
                <Button variant="plain" onClick={onClose} aria-label="Close step details">
                  <RhUiCloseIcon />
                </Button>
              </FlexItem>
            </Flex>
          </FlexItem>
        </Flex>
      </StackItem>

      {/* Side-by-side Input / Output panes */}
      <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
        {!!error && (
          <NxErrorState title="Error loading activity data" message={error} onRetry={() => detachPromise(refetch())} />
        )}
        {!error && isLoading && <Spinner aria-label="Loading activity data" />}
        {!error && !isLoading && (
          <Flex
            flexWrap={{ default: 'nowrap' }}
            alignItems={{ default: 'alignItemsStretch' }}
            style={{ height: '100%', gap: 'var(--pf-t--global--spacer--md)' }}
          >
            <FlexItem flex={{ default: 'flex_1' }} style={{ minWidth: 0, overflow: 'hidden' }}>
              <DataPane
                title="Parameters"
                nodeId={nodeId}
                data={inputData}
                view={inputView}
                onViewChange={setPanelView}
              />
            </FlexItem>
            <FlexItem flex={{ default: 'flex_1' }} style={{ minWidth: 0, overflow: 'hidden' }}>
              <DataPane
                title="Output"
                nodeId={nodeId}
                data={outputData}
                view={outputView}
                onViewChange={setOutputView}
                isErrorState={nodeIsFailed}
              />
            </FlexItem>
          </Flex>
        )}
      </StackItem>
    </Stack>
  )
}
