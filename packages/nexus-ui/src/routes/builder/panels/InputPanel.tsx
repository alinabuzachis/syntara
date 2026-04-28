import { getNodeOutputSchema } from '@ansible/nexus-contracts'
import { ExpandableSection, Stack, StackItem, Title } from '@patternfly/react-core'
import { useEffect, useMemo, useState } from 'react'

import { AppPageMain } from '../../../app/AppPage'
import { AppPanel } from '../../../components/AppPanel'
import { useWorkflowStore } from '../../../stores/useWorkflowStore'
import { selectActivities, selectTriggers } from '../../../stores/workflowStoreSelectors'

import { useUpstreamNodes, type UpstreamNodeInfo } from './hooks/useUpstreamNodes'
import { InputEmptyState } from './InputEmptyState'
import { InputViewToggle, type InputView } from './InputViewToggle'
import { NodeSelectorDropdown } from './NodeSelectorDropdown'
import styles from './panels.module.css'
import { VariablesAndContextTree } from './VariablesAndContextTree'
import { InputJsonView } from './views/InputJsonView'
import { InputSchemaPreview } from './views/InputSchemaPreview'
import { InputSchemaView } from './views/InputSchemaView'
import { InputTableView } from './views/InputTableView'

type InputPanelProps = {
  nodeId: string
  executionData?: Record<string, Record<string, unknown>> | null
  sourceNodeId?: string | null
}

export function InputPanel({ nodeId, executionData, sourceNodeId }: Readonly<InputPanelProps>) {
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

  const [activeView, setActiveView] = useState<InputView>('schema')
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

  function renderNodeContent() {
    if (!hasData) {
      const schema = selectedUpstreamNode ? getNodeOutputSchema(selectedUpstreamNode.type) : null
      if (!schema) {
        return <InputEmptyState variant="connected-not-run" />
      }
      return <InputSchemaPreview fields={schema} nodeId={selectedNodeId} />
    }

    switch (activeView) {
      case 'schema':
        return <InputSchemaView data={selectedData} nodeId={selectedNodeId} />
      case 'table':
        return <InputTableView data={selectedData} />
      case 'json':
        return <InputJsonView data={selectedData} />
    }
  }

  return (
    <AppPanel
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
              <InputViewToggle activeView={activeView} onChange={setActiveView} />
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
          <AppPageMain className={styles.scrollableContent}>
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
              <VariablesAndContextTree />
            </ExpandableSection>
          </AppPageMain>
        </Stack>
      )}
    </AppPanel>
  )
}
