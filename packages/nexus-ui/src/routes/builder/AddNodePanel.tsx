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
  /** ID of the node to replace (for generic node conversion) */
  replacementNodeId?: string | null
  /** Callback when a node is successfully replaced */
  onNodeReplaced?: (nodeId: string) => void
}

export function AddNodePanel(props: AddNodePanelProps) {
  const [selectedNodeType, setSelectedNodeType] = useState<string | null>(null)
  const moveActivityAfter = useWorkflowStore((state) => state.moveActivityAfter)
  const updateActivity = useWorkflowStore((state) => state.updateActivity)
  const removeActivity = useWorkflowStore((state) => state.removeActivity)

  // Get all registered node types
  // Filter out trigger nodes when adding via plus icon (sourceNodeId exists)
  // OR when replacing a generic node (replacementNodeId exists)
  // because triggers cannot be target nodes
  const nodeTypes = useMemo(() => {
    const allNodes = NodeRegistry.getAll()
    if (props.sourceNodeId || props.replacementNodeId) {
      return allNodes.filter((node) => node.category !== 'trigger')
    }
    return allNodes
  }, [props.sourceNodeId, props.replacementNodeId])

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
        submitButtonText={props.replacementNodeId ? 'Update node' : 'Add node'}
        onSubmit={(data) => {
          selectedNode.onSubmit(
            data,
            (newNodeId?: string) => {
              // Success callback - handle different modes
              if (props.replacementNodeId) {
                // REPLACEMENT MODE: Replace generic node with real node
                if (newNodeId) {
                  // If node was actually created, use its data
                  const currentWorkflow = useWorkflowStore.getState().currentWorkflow
                  const newActivity = currentWorkflow?.workflow.activities.find((a) => a.id === newNodeId)

                  if (newActivity) {
                    // Remove the temporary new activity first
                    removeActivity(newNodeId)

                    // Clean up metadata from new activity - remove __isGeneric flag
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    let cleanedMetadata: any = undefined
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    if ((newActivity as any).metadata) {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
                      const { __isGeneric: _isGeneric, ...restMetadata } = (newActivity as any).metadata
                      // Only keep metadata if there are other properties
                      if (Object.keys(restMetadata).length > 0) {
                        cleanedMetadata = restMetadata
                      }
                    }

                    // Update the generic node to become the real node type
                    // This preserves the ID and all connections
                    // IMPORTANT: Must explicitly set metadata to ensure __isGeneric flag is removed
                    updateActivity(props.replacementNodeId, {
                      ...newActivity,
                      id: props.replacementNodeId,
                      metadata: cleanedMetadata,
                    })
                  }
                } else {
                  // Node didn't create an activity (placeholder implementation)
                  // Just remove the __isGeneric flag to convert generic node to regular task node
                  const currentWorkflow = useWorkflowStore.getState().currentWorkflow
                  const genericActivity = currentWorkflow?.workflow.activities.find(
                    (a) => a.id === props.replacementNodeId
                  )

                  if (genericActivity) {
                    // Remove __isGeneric flag to make it render as a regular task node
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const currentMetadata = (genericActivity as any).metadata
                    if (currentMetadata) {
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      const { __isGeneric: _isGeneric, ...restMetadata } = currentMetadata
                      const newMetadata = Object.keys(restMetadata).length > 0 ? restMetadata : undefined
                      updateActivity(props.replacementNodeId, {
                        metadata: newMetadata,
                      })
                    } else {
                      // No metadata at all, make sure to clear it
                      updateActivity(props.replacementNodeId, {
                        metadata: undefined,
                      })
                    }
                  }
                }
                // Notify parent that node was replaced so it can open the edit form
                if (props.onNodeReplaced) {
                  props.onNodeReplaced(props.replacementNodeId)
                }
              } else if (props.sourceNodeId && newNodeId) {
                // CONNECT MODE: Move the newly added activity to the correct position (after sourceNodeId)
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
