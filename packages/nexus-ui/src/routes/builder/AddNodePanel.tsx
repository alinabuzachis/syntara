import { SelectableCardList, SelectableCardWithForm, SidePanel } from '@ansible/nexus-ui-framework'
import { PlusIcon } from 'lucide-react'
import { useMemo, useState } from 'react'

import { useWorkflowStore } from '../../stores/useWorkflowStore'

import { NodeRegistry } from './registry/NodeRegistry'

interface AddNodePanelProps {
  onClose: () => void
  onNodeSelect?: (message: string, title: string) => void
  onNodeError?: (error: string, title: string) => void
  sourceNodeId?: string | null
  onConnect?: (sourceId: string, targetId: string) => void
}

export function AddNodePanel(props: AddNodePanelProps) {
  const [selectedNodeType, setSelectedNodeType] = useState<string | null>(null)
  const moveActivityAfter = useWorkflowStore((state) => state.moveActivityAfter)

  // Get all registered node types
  // Filter out trigger nodes when adding via plus icon (sourceNodeId exists)
  // because triggers cannot be target nodes
  const nodeTypes = useMemo(() => {
    const allNodes = NodeRegistry.getAll()
    if (props.sourceNodeId) {
      return allNodes.filter((node) => node.category !== 'trigger')
    }
    return allNodes
  }, [props.sourceNodeId])

  const handleNodeClick = (nodeId: string) => {
    setSelectedNodeType(selectedNodeType === nodeId ? null : nodeId)
  }

  const handleFormCancel = () => {
    setSelectedNodeType(null)
  }

  // Get the selected node type definition
  const selectedNode = selectedNodeType ? NodeRegistry.get(selectedNodeType) : null

  const renderForm = () => {
    if (!selectedNode) return null

    const FormComponent = selectedNode.formComponent

    return (
      <FormComponent
        onSubmit={(data) => {
          selectedNode.onSubmit(
            data,
            (newNodeId?: string) => {
              // Success callback
              if (props.sourceNodeId && newNodeId) {
                // Move the newly added activity to the correct position (after sourceNodeId)
                moveActivityAfter(newNodeId, props.sourceNodeId)

                // Connect if onConnect callback exists
                if (props.onConnect) {
                  props.onConnect(props.sourceNodeId, newNodeId)
                }
              }
              setSelectedNodeType(null)
              props.onClose()
            },
            (error) => {
              // Error callback - show error alert
              if (props.onNodeError) {
                props.onNodeError(error, 'Failed to add node')
              }
            }
          )
        }}
        onCancel={handleFormCancel}
      />
    )
  }

  return (
    <SidePanel onClose={props.onClose} title="Add Node" icon={PlusIcon} width="md">
      <SelectableCardList>
        {nodeTypes.map((nodeType) => {
          const isSelected = selectedNodeType === nodeType.id

          return (
            <SelectableCardWithForm
              key={nodeType.id}
              icon={nodeType.icon}
              label={nodeType.label}
              description={nodeType.description}
              isSelected={isSelected}
              onClick={() => handleNodeClick(nodeType.id)}
              title={nodeType.description}
              form={renderForm()}
              onClose={handleFormCancel}
            />
          )
        })}
      </SelectableCardList>
    </SidePanel>
  )
}
