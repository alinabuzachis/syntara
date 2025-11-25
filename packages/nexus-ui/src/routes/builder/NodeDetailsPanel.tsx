import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { SidePanel } from '@ansible/nexus-ui-framework'
import type { Node } from '@xyflow/react'
import { FileTextIcon } from 'lucide-react'

import { useWorkflowStore } from '../../stores/useWorkflowStore'
import type { NodeType } from '../automations/canvas/nodes/NodeType'

import {
  ConditionNodeDetails,
  JoinNodeDetails,
  LoopNodeDetails,
  TaskNodeDetails,
  TriggerNodeDetails,
} from './node-details'
import { NodeRawDataView } from './NodeRawDataView'

/**
 * IMPORTANT: When adding a new node type, ensure the corresponding NodeDetails component
 * calls onClose() after successfully updating the node. This ensures the side panel
 * closes automatically after modifications.
 */

// Type aliases
type TaskActivity = WorkflowAPI['components']['schemas']['activity'] & { type: 'task' }
type ConditionActivity = WorkflowAPI['components']['schemas']['activity'] & { type: 'condition' }
type LoopActivity = WorkflowAPI['components']['schemas']['activity'] & { type: 'loop' }
type JoinActivity = WorkflowAPI['components']['schemas']['activity'] & { type: 'join' }

interface NodeDetailsPanelProps {
  node: Node<NodeType['data']>
  onClose: () => void
}

export function NodeDetailsPanel(props: NodeDetailsPanelProps) {
  const { node, onClose } = props
  const currentWorkflow = useWorkflowStore((state) => state.currentWorkflow)

  const getNodeTitle = () => {
    if (node.type === 'trigger') {
      return 'Trigger Details'
    }
    if (node.type === 'task' && typeof node.data === 'object' && node.data && 'name' in node.data) {
      return node.data.name as string
    }
    if (node.type === 'condition' && typeof node.data === 'object' && node.data && 'name' in node.data) {
      return node.data.name as string
    }
    if (node.type === 'loop' && typeof node.data === 'object' && node.data && 'name' in node.data) {
      return node.data.name as string
    }
    if (node.type === 'join' && typeof node.data === 'object' && node.data && 'name' in node.data) {
      return node.data.name as string
    }
    return 'Node Details'
  }

  const renderContent = () => {
    // Handle trigger node
    if (node.type === 'trigger') {
      // Get trigger from workflow by index (assuming node id is "trigger-0", "trigger-1", etc.)
      const triggerIndex = parseInt(node.id.split('-')[1] || '0')
      const trigger = currentWorkflow?.triggers?.[triggerIndex]

      if (trigger) {
        return <TriggerNodeDetails trigger={trigger} triggerIndex={triggerIndex} onClose={onClose} />
      }
    }

    // Render appropriate form based on node type
    if (node.type === 'task') {
      const taskData = node.data as TaskActivity
      return <TaskNodeDetails taskData={taskData} nodeId={node.id} onClose={onClose} />
    }

    if (node.type === 'condition') {
      const conditionData = node.data as ConditionActivity
      return <ConditionNodeDetails conditionData={conditionData} nodeId={node.id} onClose={onClose} />
    }

    if (node.type === 'loop') {
      const loopData = node.data as LoopActivity
      return <LoopNodeDetails loopData={loopData} nodeId={node.id} onClose={onClose} />
    }

    if (node.type === 'join') {
      const joinData = node.data as JoinActivity
      return <JoinNodeDetails joinData={joinData} nodeId={node.id} onClose={onClose} />
    }

    // Default fallback - show raw data
    return <NodeRawDataView node={node} />
  }

  return (
    <SidePanel onClose={onClose} title={getNodeTitle()} icon={FileTextIcon} width="lg">
      {renderContent()}
    </SidePanel>
  )
}
