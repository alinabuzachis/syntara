import type {
  ConditionActivity,
  ConvergeActivity,
  LoopActivity,
  TaskActivity,
  WorkflowAPI,
} from '@ansible/nexus-contracts'
import type { Node } from '@xyflow/react'
import type { ReactNode } from 'react'
import { useState } from 'react'

import { useAlerts } from '../../components/alerts'
import { FlowNodeType } from '../../constants'
import { useWorkflowStore, useWorkflowStoreActions, selectCurrentWorkflow } from '../../stores/useWorkflowStore'
import { parseTriggerIndex } from '../../utils/triggerNodeIds'
import { NodeMenu } from '../automations/canvas/nodes/common/NodeMenu'
import { MenuNodeType, useNodeMenuActions } from '../automations/canvas/nodes/hooks/useNodeMenuActions'
import type { NodeType } from '../automations/canvas/nodes/NodeType'
import { renderNodeIcon } from '../automations/canvas/nodes/renderNodeIcon'

import {
  ApprovalNodeDetails,
  ConditionNodeDetails,
  ConvergeNodeDetails,
  LoopNodeDetails,
  TaskNodeDetails,
  TriggerNodeDetails,
} from './node-details'
import { NodeEditorLayout } from './NodeEditorLayout'
import { NodeRawDataView } from './NodeRawDataView'
import { NodeRegistry } from './registry/NodeRegistry'
import { resolveIconForNode, resolveIconForType } from './utils/nodeIcons'
import { getDefaultNodeBaseName, getNodeDisplayName } from './utils/nodeNaming'
import { buildPanelMenuActions } from './utils/panelMenuActions'

/**
 * IMPORTANT: When adding a new node type, ensure the corresponding NodeDetails component
 * calls onClose() after successfully updating the node. This ensures the side panel
 * closes automatically after modifications.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cleanActivityMetadata(activity: any): any {
  const metadata = activity?.metadata
  if (!metadata) return undefined
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { __isGeneric: _isGeneric, ...restMetadata } = metadata
  return Object.keys(restMetadata).length > 0 ? restMetadata : undefined
}

interface NodeDetailsPanelProps {
  mode: 'add' | 'edit'
  node?: Node<NodeType['data']>
  nodeTypeId?: string | null
  nodeSubtypeId?: string | null
  sourceNodeId?: string | null
  replacementNodeId?: string | null
  onConnect?: (sourceId: string, targetId: string) => void
  onClose: () => void
}

export function NodeDetailsPanel(props: NodeDetailsPanelProps) {
  const { mode, node, nodeTypeId, nodeSubtypeId, sourceNodeId, replacementNodeId, onConnect, onClose } = props
  const { showError } = useAlerts()
  // Use typed selector for optimized subscription
  const currentWorkflow = useWorkflowStore(selectCurrentWorkflow)
  const [headerContent, setHeaderContent] = useState<ReactNode | null>(null)
  // Use action accessor - component won't re-render when store state changes
  const { moveActivityAfter, updateActivity, removeActivity } = useWorkflowStoreActions()
  const isTriggerNode = node?.type === FlowNodeType.TRIGGER
  const triggerIndex = isTriggerNode ? parseTriggerIndex(node?.id ?? '') : undefined
  const nodeMenuType = isTriggerNode ? MenuNodeType.TRIGGER : MenuNodeType.ACTIVITY
  const menuActions = useNodeMenuActions({
    nodeId: node?.id ?? 'unknown',
    nodeType: nodeMenuType,
    triggerIndex: isTriggerNode ? triggerIndex : undefined,
  })
  const panelMenuActions = buildPanelMenuActions(mode, node, menuActions, onClose)
  const headerActions = panelMenuActions.length > 0 ? <NodeMenu menuActions={panelMenuActions} /> : null

  const iconDescriptor =
    mode === 'edit' && node
      ? resolveIconForNode(node, currentWorkflow)
      : resolveIconForType({ nodeTypeId, nodeSubtypeId })
  const headerIcon = renderNodeIcon(iconDescriptor.icon, iconDescriptor.id, 'header')

  const renderContent = () => {
    if (mode === 'add') {
      const selectedNode = nodeTypeId ? NodeRegistry.get(nodeTypeId) : null
      const selectedSubtype = selectedNode?.subtypes?.find((subtype) => subtype.id === nodeSubtypeId) ?? null

      if (!selectedNode) return null

      const initialData = {
        ...(selectedSubtype?.initialData ?? {}),
      } as Record<string, unknown>

      initialData.name ??= getNodeDisplayName(
        getDefaultNodeBaseName({
          nodeTypeId: selectedNode.id,
          nodeSubtypeId: selectedSubtype?.id,
          initialData,
          label: selectedSubtype?.label ?? selectedNode.label,
        })
      )

      const FormComponent = selectedNode.formComponent
      const subtypeFormProps = selectedSubtype?.formProps ?? {}
      const submitButtonText = replacementNodeId ? 'Update node' : 'Add node'

      const handleCreate = (data: Record<string, unknown>) => {
        selectedNode.onSubmit(
          data,
          (newNodeId?: string) => {
            if (replacementNodeId) {
              if (newNodeId) {
                const current = useWorkflowStore.getState().currentWorkflow
                const newActivity = current?.workflow.activities.find(
                  (activity: WorkflowAPI.components['schemas']['activity']) => activity.id === newNodeId
                )
                if (newActivity) {
                  removeActivity(newNodeId)
                  const cleanedMetadata = cleanActivityMetadata(newActivity)
                  updateActivity(replacementNodeId, {
                    ...newActivity,
                    id: replacementNodeId,
                    metadata: cleanedMetadata,
                  } as unknown as Partial<WorkflowAPI.components['schemas']['activity']>)
                }
              } else {
                const current = useWorkflowStore.getState().currentWorkflow
                const genericActivity = current?.workflow.activities.find(
                  (activity: WorkflowAPI.components['schemas']['activity']) => activity.id === replacementNodeId
                )
                if (genericActivity) {
                  const cleanedMetadata = cleanActivityMetadata(genericActivity)
                  updateActivity(replacementNodeId, {
                    metadata: cleanedMetadata ?? undefined,
                  } as unknown as Partial<WorkflowAPI.components['schemas']['activity']>)
                }
              }
            } else if (sourceNodeId && newNodeId) {
              moveActivityAfter(newNodeId, sourceNodeId)
              if (onConnect) {
                onConnect(sourceNodeId, newNodeId)
              }
            }

            onClose()
          },
          (error: string) => {
            showError(error, 'Failed to add node')
          }
        )
      }

      return (
        <FormComponent
          {...subtypeFormProps}
          initialData={initialData}
          submitButtonText={submitButtonText}
          onCancel={onClose}
          onSubmit={(data) => handleCreate(data as Record<string, unknown>)}
          onHeaderContentChange={setHeaderContent}
        />
      )
    }

    if (!node) return null

    // Handle trigger node
    if (node.type === FlowNodeType.TRIGGER) {
      // Get trigger from workflow by index (assuming node id is "trigger-0", "trigger-1", etc.)
      const triggerIndex = parseTriggerIndex(node.id) ?? 0
      const trigger = currentWorkflow?.triggers?.[triggerIndex]

      if (trigger) {
        return (
          <TriggerNodeDetails
            trigger={trigger}
            triggerIndex={triggerIndex}
            onClose={onClose}
            onHeaderContentChange={setHeaderContent}
          />
        )
      }
    }

    // Render appropriate form based on node type
    if (node.type === FlowNodeType.TASK) {
      const taskData = node.data as TaskActivity
      return (
        <TaskNodeDetails
          taskData={taskData}
          nodeId={node.id}
          onClose={onClose}
          onHeaderContentChange={setHeaderContent}
        />
      )
    }

    if (node.type === FlowNodeType.APPROVAL) {
      const taskData = node.data as TaskActivity
      return (
        <ApprovalNodeDetails
          taskData={taskData}
          nodeId={node.id}
          onClose={onClose}
          onHeaderContentChange={setHeaderContent}
        />
      )
    }

    if (node.type === FlowNodeType.CONDITION) {
      const conditionData = node.data as ConditionActivity
      return (
        <ConditionNodeDetails
          conditionData={conditionData}
          nodeId={node.id}
          onClose={onClose}
          onHeaderContentChange={setHeaderContent}
        />
      )
    }

    if (node.type === FlowNodeType.LOOP) {
      const loopData = node.data as LoopActivity
      return (
        <LoopNodeDetails
          loopData={loopData}
          nodeId={node.id}
          onClose={onClose}
          onHeaderContentChange={setHeaderContent}
        />
      )
    }

    if (node.type === 'converge') {
      const convergeData = node.data as ConvergeActivity
      return (
        <ConvergeNodeDetails
          convergeData={convergeData}
          nodeId={node.id}
          onClose={onClose}
          onHeaderContentChange={setHeaderContent}
        />
      )
    }

    // Default fallback - show raw data
    return <NodeRawDataView node={node} />
  }

  const showInputPanel = mode === 'add' ? nodeTypeId !== 'trigger' : node?.type !== FlowNodeType.TRIGGER

  return (
    <NodeEditorLayout
      parametersContent={renderContent()}
      headerContent={headerContent}
      headerIcon={headerIcon}
      headerActions={headerActions}
      showInputPanel={showInputPanel}
      onClose={onClose}
    />
  )
}
