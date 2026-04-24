import type { ConditionActivity, ConvergeActivity, LoopActivity, TaskActivity } from '@ansible/nexus-contracts'
import type { Node } from '@xyflow/react'
import type { ReactNode } from 'react'
import { useState } from 'react'

import { useAlerts } from '../../components/alerts'
import { FlowNodeType, RegistryNodeId } from '../../constants'
import {
  useWorkflowStore,
  useWorkflowStoreActions,
  selectCurrentWorkflow,
  getActivityMetadata,
  type Activity,
  type ActivityMetadata,
} from '../../stores/useWorkflowStore'
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
 * IMPORTANT: When adding a new step type, ensure the corresponding NodeDetails component
 * calls onClose() after successfully updating the step. This ensures the side panel
 * closes automatically after modifications.
 */

/**
 * Remove __isGeneric from already-sanitized metadata.
 * SECURITY: Input MUST be pre-sanitized by getActivityMetadata().
 * This function only removes __isGeneric; it does NOT enforce the allowlist.
 */
function cleanMetadata(metadata: ActivityMetadata | undefined): ActivityMetadata | undefined {
  if (!metadata) return undefined
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { __isGeneric: _isGeneric, ...rest } = metadata
  return Object.keys(rest).length > 0 ? (rest as ActivityMetadata) : undefined
}

/** Top-level search is correct: the builder store always holds a flat activity list (see WorkflowTransform). */
function findActivityInCurrentWorkflow(activityId: string): Activity | undefined {
  const current = useWorkflowStore.getState().currentWorkflow
  return current?.workflow.activities.find((activity: Activity) => activity.id === activityId)
}

type NodeDetailsPanelProps = {
  mode: 'add' | 'edit'
  node?: Node<NodeType['data']>
  nodeTypeId?: string | null
  nodeSubtypeId?: string | null
  sourceNodeId?: string | null
  replacementNodeId?: string | null
  executionId?: string | null
  workflowId?: string | null
  onConnect?: (sourceId: string, targetId: string) => void
  onClose: () => void
  projectId?: string
}

export function NodeDetailsPanel(props: NodeDetailsPanelProps) {
  const {
    mode,
    node,
    nodeTypeId,
    nodeSubtypeId,
    sourceNodeId,
    replacementNodeId,
    executionId,
    workflowId,
    onConnect,
    onClose,
    projectId,
  } = props
  const { showError } = useAlerts()
  // Use typed selector for optimized subscription
  const currentWorkflow = useWorkflowStore(selectCurrentWorkflow)
  const [headerContent, setHeaderContent] = useState<ReactNode | null>(null)
  // Use action accessor - component won't re-render when store state changes
  const { moveActivityAfter, updateActivity, replaceActivity, removeActivity } = useWorkflowStoreActions()
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

  // eslint-disable-next-line complexity
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
      const submitButtonText = 'Add step'

      /** Returns true if replacement succeeded, false if lookup failed. */
      const handleReplacement = (newNodeId: string | undefined): boolean => {
        if (!replacementNodeId) return false

        if (newNodeId) {
          const newActivity = findActivityInCurrentWorkflow(newNodeId)
          if (!newActivity) return false

          removeActivity(newNodeId)
          const cleaned = cleanMetadata(getActivityMetadata(newActivity))
          replaceActivity(replacementNodeId, {
            ...newActivity,
            id: replacementNodeId,
            metadata: cleaned,
          })
        } else {
          const genericActivity = findActivityInCurrentWorkflow(replacementNodeId)
          if (!genericActivity) return false

          const cleaned = cleanMetadata(getActivityMetadata(genericActivity))
          updateActivity(replacementNodeId, {
            metadata: cleaned,
          })
        }
        return true
      }

      const handleCreate = (data: Record<string, unknown>) => {
        selectedNode.onSubmit(
          data,
          (newNodeId?: string) => {
            if (replacementNodeId) {
              if (!handleReplacement(newNodeId)) {
                showError('Replacement failed', 'Failed to replace step — step not found')
                return
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
            showError('Add step failed', error)
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
          projectId={projectId}
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
          projectId={projectId}
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

    if (node.type === FlowNodeType.CONVERGE) {
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

  const showInputPanel = mode === 'add' ? nodeTypeId !== RegistryNodeId.TRIGGER : node?.type !== FlowNodeType.TRIGGER

  return (
    <NodeEditorLayout
      parametersContent={renderContent()}
      headerContent={headerContent}
      headerIcon={headerIcon}
      headerActions={headerActions}
      showInputPanel={showInputPanel}
      nodeId={node?.id}
      executionId={executionId}
      workflowId={workflowId}
      onClose={onClose}
      sourceNodeId={sourceNodeId}
    />
  )
}
