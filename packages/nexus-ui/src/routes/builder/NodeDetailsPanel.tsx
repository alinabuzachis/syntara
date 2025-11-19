import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { SidePanel } from '@ansible/nexus-ui-framework'
import type { Node } from '@xyflow/react'
import { FileTextIcon } from 'lucide-react'

import type { NodeType } from '../automations/canvas/nodes/NodeType'

import { ConditionNodeDetails, LoopNodeDetails, TaskNodeDetails } from './node-details'
import { NodeRawDataView } from './NodeRawDataView'

// Type aliases
type TaskActivity = WorkflowAPI['components']['schemas']['activity'] & { type: 'task' }
type ConditionActivity = WorkflowAPI['components']['schemas']['activity'] & { type: 'condition' }
type LoopActivity = WorkflowAPI['components']['schemas']['activity'] & { type: 'loop' }

interface NodeDetailsPanelProps {
  node: Node<NodeType['data']>
  onClose: () => void
}

export function NodeDetailsPanel(props: NodeDetailsPanelProps) {
  const { node, onClose } = props

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

    // Default fallback - show raw data
    return <NodeRawDataView node={node} />
  }

  return (
    <SidePanel onClose={onClose} title={getNodeTitle()} icon={FileTextIcon} width="lg">
      {renderContent()}
    </SidePanel>
  )
}
