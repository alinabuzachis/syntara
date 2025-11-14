import { useState, useMemo } from 'react'
import { PlusIcon } from 'lucide-react'
import { SelectableCardWithForm, SelectableCardList, SidePanel } from '@ansible/nexus-ui-framework'
import { NodeRegistry } from './registry/NodeRegistry'

interface AddNodePanelProps {
  onClose: () => void
  onNodeSelect?: (message: string, title: string) => void
  onNodeError?: (error: string, title: string) => void
}

export function AddNodePanel(props: AddNodePanelProps) {
  const [selectedNodeType, setSelectedNodeType] = useState<string | null>(null)

  // Get all registered node types
  const nodeTypes = useMemo(() => NodeRegistry.getAll(), [])

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
            () => {
              // Success callback - deselect the node to allow adding another
              setSelectedNodeType(null)
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
            />
          )
        })}
      </SelectableCardList>
    </SidePanel>
  )
}
