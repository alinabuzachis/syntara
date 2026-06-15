import { getNodeOutputSchema, TriggerTypeEnum, type OutputFieldDef } from '@ansible/nexus-contracts'
import { ExpandableSection, Stack, StackItem, Title } from '@patternfly/react-core'
import { useEffect, useMemo, useState } from 'react'

import { NxPageBody } from '../../../components/layout/NxPage'
import { NxPanel } from '../../../components/layout/NxPanel'
import { useWorkflowStore } from '../../../stores/useWorkflowStore'
import { selectActivities, selectTriggers } from '../../../stores/workflowStoreSelectors'
import { parseTriggerIndex } from '../../../utils/triggerNodeIds'
import type { WorkflowMetadata } from '../types/workflowMetadata'

import { useUpstreamNodes, type UpstreamNodeInfo } from './hooks/useUpstreamNodes'
import { InputEmptyState } from './InputEmptyState'
import { NodeSelectorDropdown } from './NodeSelectorDropdown'
import styles from './panels.module.css'
import { VariablesAndContextTree } from './VariablesAndContextTree'
import { InputJsonView } from './views/InputJsonView'
import { InputSchemaPreview } from './views/InputSchemaPreview'
import { InputSchemaView } from './views/InputSchemaView'
import { InputTableView } from './views/InputTableView'
import { ViewToggle, type PanelView } from './ViewToggle'

function mapJsonSchemaType(type?: string): OutputFieldDef['type'] {
  switch (type) {
    case 'string':
      return 'string'
    case 'number':
    case 'integer':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'object':
      return 'object'
    case 'array':
      return 'array'
    case undefined:
    default:
      return 'unknown'
  }
}

type InputSchemaProperties = Record<string, { type?: string; description?: string }>

function getTriggerInputSchemaFields(
  nodeId: string,
  triggersList: { id: string; parameters?: Record<string, unknown> }[] | undefined
): OutputFieldDef[] | null {
  let trigger = triggersList?.find((t) => t.id === nodeId)
  if (!trigger) {
    const displayIndex = parseTriggerIndex(nodeId)
    if (displayIndex !== undefined && triggersList?.[displayIndex]) {
      trigger = triggersList[displayIndex]
    }
  }
  if (!trigger) return null
  const inputSchema = trigger.parameters?.input_schema as Record<string, unknown> | undefined
  if (!inputSchema || typeof inputSchema !== 'object') return null
  const properties = inputSchema.properties as InputSchemaProperties | undefined
  if (!properties || Object.keys(properties).length === 0) return null
  return Object.entries(properties).map(([name, prop]) => ({
    name,
    type: mapJsonSchemaType(prop.type),
    description: prop.description ?? `Input parameter: ${name}`,
  }))
}

const TRIGGER_TYPES: ReadonlySet<string> = new Set([
  TriggerTypeEnum.MANUAL_TRIGGER,
  TriggerTypeEnum.SCHEDULED,
  TriggerTypeEnum.EVENT,
  TriggerTypeEnum.WEBHOOK_TRIGGER,
  TriggerTypeEnum.EDA_TRIGGER,
])

type InputPanelProps = {
  nodeId: string
  executionData?: Record<string, Record<string, unknown>> | null
  sourceNodeId?: string | null
  workflowMetadata?: WorkflowMetadata
}

export function InputPanel({ nodeId, executionData, sourceNodeId, workflowMetadata }: Readonly<InputPanelProps>) {
  const upstreamNodes = useUpstreamNodes(nodeId)
  const sourceAncestors = useUpstreamNodes(sourceNodeId ?? '')
  const activities = useWorkflowStore(selectActivities)
  const triggers = useWorkflowStore(selectTriggers)

  const effectiveUpstream: UpstreamNodeInfo[] = useMemo(() => {
    if (upstreamNodes.length > 0) return upstreamNodes
    if (!sourceNodeId) return []

    const activity = activities?.find((a) => a.id === sourceNodeId)
    if (activity) {
      return [{ id: activity.id, name: activity.name, type: activity.type }, ...sourceAncestors]
    }

    const trigger = triggers?.find((t) => t.id === sourceNodeId)
    if (trigger) {
      return [{ id: trigger.id, name: trigger.name, type: trigger.type }, ...sourceAncestors]
    }

    return []
  }, [upstreamNodes, sourceNodeId, sourceAncestors, activities, triggers])

  const hasUpstream = effectiveUpstream.length > 0

  const [activeView, setActiveView] = useState<PanelView>('schema')
  const [selectedNodeId, setSelectedNodeId] = useState<string>(effectiveUpstream[0]?.id ?? '')
  const [isNodeSectionExpanded, setIsNodeSectionExpanded] = useState(true)
  const [isVarsSectionExpanded, setIsVarsSectionExpanded] = useState(false)

  const firstUpstreamId = effectiveUpstream[0]?.id ?? ''
  useEffect(() => {
    setSelectedNodeId(firstUpstreamId)
  }, [firstUpstreamId])

  const hasData = hasUpstream && executionData != null && Object.keys(executionData).length > 0
  const selectedData = hasData ? (executionData[selectedNodeId] ?? null) : null

  const selectedUpstreamNode = effectiveUpstream.find((n) => n.id === selectedNodeId)

  const nodeSectionTitle = selectedUpstreamNode?.name ? `[ ${selectedUpstreamNode.name} ]` : '[ Upstream node ]'

  const expressionNodeId =
    selectedUpstreamNode && TRIGGER_TYPES.has(selectedUpstreamNode.type) ? 'trigger' : selectedNodeId

  function renderNodeContent() {
    if (!hasData) {
      const schema = selectedUpstreamNode ? getNodeOutputSchema(selectedUpstreamNode.type) : null
      const effectiveSchema = schema ?? getTriggerInputSchemaFields(selectedNodeId, triggers)
      if (!effectiveSchema) {
        return <InputEmptyState variant="connected-not-run" />
      }
      return <InputSchemaPreview fields={effectiveSchema} nodeId={expressionNodeId} />
    }

    switch (activeView) {
      case 'schema':
        return <InputSchemaView data={selectedData} nodeId={expressionNodeId} />
      case 'table':
        return <InputTableView data={selectedData} />
      case 'json':
        return <InputJsonView data={selectedData} />
      default: {
        const _exhaustive: never = activeView
        return _exhaustive
      }
    }
  }

  return (
    <NxPanel
      variant="raised"
      isFullHeight
      className={styles.panelContainer}
      panelMainProps={{ className: styles.panelMain }}
      panelMainBodyProps={{ className: styles.panelBodyFlex }}
    >
      <Title headingLevel="h2" size="md">
        Input
      </Title>
      {!hasUpstream && <InputEmptyState variant="not-connected" />}
      {hasUpstream && (
        <Stack hasGutter className={styles.fillMinHeight}>
          {hasData && (
            <StackItem>
              <ViewToggle activeView={activeView} onChange={setActiveView} ariaLabel="Input view selection" />
            </StackItem>
          )}
          {effectiveUpstream.length > 1 && (
            <StackItem>
              <NodeSelectorDropdown
                nodes={effectiveUpstream}
                selectedNodeId={selectedNodeId}
                onSelect={setSelectedNodeId}
              />
            </StackItem>
          )}
          <NxPageBody className={styles.scrollableContent}>
            <ExpandableSection
              toggleText={nodeSectionTitle}
              isIndented
              isExpanded={isNodeSectionExpanded}
              onToggle={(_event, expanded) => setIsNodeSectionExpanded(expanded)}
            >
              {renderNodeContent()}
            </ExpandableSection>
            <ExpandableSection
              toggleText="Variables and context"
              isIndented
              isExpanded={isVarsSectionExpanded}
              onToggle={(_event, expanded) => setIsVarsSectionExpanded(expanded)}
            >
              <VariablesAndContextTree workflowMetadata={workflowMetadata} />
            </ExpandableSection>
          </NxPageBody>
        </Stack>
      )}
    </NxPanel>
  )
}
