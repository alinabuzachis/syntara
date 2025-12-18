import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { Button, CompassPanel, Flex, FlexItem, Icon, Stack, StackItem, Title, TitleSizes } from '@patternfly/react-core'
import { FileIcon, TimesIcon } from '@patternfly/react-icons'
import type { Node } from '@xyflow/react'

import { FlowNodeType } from '../../constants'
import { useWorkflowStore, selectCurrentWorkflow } from '../../stores/useWorkflowStore'
import type { NodeType } from '../automations/canvas/nodes/NodeType'

import {
  ConditionNodeDetails,
  ConvergeNodeDetails,
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
type ConvergeActivity = WorkflowAPI['components']['schemas']['activity'] & { type: 'converge' }

interface NodeDetailsPanelProps {
  node: Node<NodeType['data']>
  onClose: () => void
}

export function NodeDetailsPanel(props: NodeDetailsPanelProps) {
  const { node, onClose } = props
  // Use typed selector for optimized subscription
  const currentWorkflow = useWorkflowStore(selectCurrentWorkflow)

  const getNodeTitle = () => {
    if (node.type === FlowNodeType.TRIGGER) {
      return 'Trigger Details'
    }
    if (node.type === FlowNodeType.TASK && typeof node.data === 'object' && node.data && 'name' in node.data) {
      return node.data.name as string
    }
    if (node.type === FlowNodeType.CONDITION && typeof node.data === 'object' && node.data && 'name' in node.data) {
      return node.data.name as string
    }
    if (node.type === FlowNodeType.LOOP && typeof node.data === 'object' && node.data && 'name' in node.data) {
      return node.data.name as string
    }
    if (node.type === 'converge' && typeof node.data === 'object' && node.data && 'name' in node.data) {
      return node.data.name as string
    }
    return 'Node Details'
  }

  const renderContent = () => {
    // Handle trigger node
    if (node.type === FlowNodeType.TRIGGER) {
      // Get trigger from workflow by index (assuming node id is "trigger-0", "trigger-1", etc.)
      const triggerIndex = Number.parseInt(node.id.split('-')[1] || '0')
      const trigger = currentWorkflow?.triggers?.[triggerIndex]

      if (trigger) {
        return <TriggerNodeDetails trigger={trigger} triggerIndex={triggerIndex} onClose={onClose} />
      }
    }

    // Render appropriate form based on node type
    if (node.type === FlowNodeType.TASK) {
      const taskData = node.data as TaskActivity
      return <TaskNodeDetails taskData={taskData} nodeId={node.id} onClose={onClose} />
    }

    if (node.type === FlowNodeType.CONDITION) {
      const conditionData = node.data as ConditionActivity
      return <ConditionNodeDetails conditionData={conditionData} nodeId={node.id} onClose={onClose} />
    }

    if (node.type === FlowNodeType.LOOP) {
      const loopData = node.data as LoopActivity
      return <LoopNodeDetails loopData={loopData} nodeId={node.id} onClose={onClose} />
    }

    if (node.type === 'converge') {
      const convergeData = node.data as ConvergeActivity
      return <ConvergeNodeDetails convergeData={convergeData} nodeId={node.id} onClose={onClose} />
    }

    // Default fallback - show raw data
    return <NodeRawDataView node={node} />
  }

  return (
    <CompassPanel
      style={{
        height: '100%',
        maxHeight: '100%',
        width: '24rem',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <Stack>
        <StackItem style={{ flexShrink: 0, paddingBottom: 'var(--pf-t--global--spacer--lg)' }}>
          <Flex alignItems={{ default: 'alignItemsCenter' }} justifyContent={{ default: 'justifyContentSpaceBetween' }}>
            <FlexItem>
              <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapMd' }}>
                <Icon>
                  <FileIcon />
                </Icon>
                <Title headingLevel="h2" size={TitleSizes.lg}>
                  {getNodeTitle()}
                </Title>
              </Flex>
            </FlexItem>
            <FlexItem>
              <Button variant="plain" onClick={onClose} aria-label="Close">
                <Icon>
                  <TimesIcon />
                </Icon>
              </Button>
            </FlexItem>
          </Flex>
        </StackItem>
        <StackItem
          isFilled
          style={{
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            paddingBottom: 'var(--pf-t--global--spacer--lg)',
          }}
        >
          {renderContent()}
        </StackItem>
      </Stack>
    </CompassPanel>
  )
}
