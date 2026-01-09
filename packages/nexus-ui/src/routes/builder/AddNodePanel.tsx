import type { WorkflowAPI } from '@ansible/nexus-contracts'
import {
  Button,
  CompassPanel,
  Content,
  Flex,
  FlexItem,
  Icon,
  PanelMain,
  PanelMainBody,
  Split,
  SplitItem,
  Stack,
  StackItem,
  Title,
  TitleSizes,
} from '@patternfly/react-core'
import { RhUiAddIcon, RhUiCloseIcon, RhUiArrowLeftIcon } from '@patternfly/react-icons'
import { useMemo, useState } from 'react'

import { useWorkflowStore, useWorkflowStoreActions } from '../../stores/useWorkflowStore'

type Activity = WorkflowAPI.components['schemas']['activity']

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
  // Use action accessor - component won't re-render when store state changes
  const { moveActivityAfter, updateActivity, removeActivity } = useWorkflowStoreActions()

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
                  const newActivity = currentWorkflow?.workflow.activities.find((a: Activity) => a.id === newNodeId)

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
                    (a: Activity) => a.id === props.replacementNodeId
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
    <CompassPanel
      hasNoPadding
      style={{
        height: '100%',
        maxHeight: '100%',
        width: '20rem',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <Stack>
        <StackItem>
          <Flex
            alignItems={{ default: 'alignItemsCenter' }}
            justifyContent={{ default: 'justifyContentSpaceBetween' }}
            style={{ padding: 'var(--pf-t--global--spacer--md)' }}
          >
            <FlexItem>
              <Flex gap={{ default: 'gapSm' }} alignItems={{ default: 'alignItemsCenter' }}>
                <FlexItem>
                  <Icon>
                    <RhUiAddIcon />
                  </Icon>
                </FlexItem>
                <FlexItem>
                  <Title headingLevel="h2" size={TitleSizes.lg}>
                    Add Node
                  </Title>
                </FlexItem>
              </Flex>
            </FlexItem>
            <FlexItem>
              <Button variant="plain" onClick={props.onClose} aria-label="Close">
                <Icon>
                  <RhUiCloseIcon />
                </Icon>
              </Button>
            </FlexItem>
          </Flex>
        </StackItem>
        <StackItem
          isFilled
          style={{
            overflowY: 'auto',
            overflowX: 'visible',
            paddingLeft: 'var(--pf-t--global--spacer--md)',
            paddingRight: 'var(--pf-t--global--spacer--md)',
            paddingBottom: 'var(--pf-t--global--spacer--md)',
          }}
        >
          <Stack hasGutter>
            {selectedNodeType
              ? // When a form is selected, only show that form
                (() => {
                  const selectedNode = NodeRegistry.get(selectedNodeType)
                  if (!selectedNode) return null

                  return (
                    <StackItem>
                      <CompassPanel>
                        <PanelMain>
                          <PanelMainBody>
                            <Stack hasGutter>
                              <StackItem>
                                <Flex gap={{ default: 'gapXs' }}>
                                  <FlexItem>
                                    <Button
                                      variant="plain"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleFormCancel()
                                      }}
                                      aria-label="Back"
                                    >
                                      <Icon>
                                        <RhUiArrowLeftIcon />
                                      </Icon>
                                    </Button>
                                  </FlexItem>
                                  <FlexItem grow={{ default: 'grow' }}>
                                    <Title headingLevel="h3" size="md">
                                      Configure {selectedNode.label}
                                    </Title>
                                  </FlexItem>
                                </Flex>
                              </StackItem>
                              <StackItem>{renderForm()}</StackItem>
                            </Stack>
                          </PanelMainBody>
                        </PanelMain>
                      </CompassPanel>
                    </StackItem>
                  )
                })()
              : // When no form is selected, show all node type cards
                nodeTypes.map((nodeType) => {
                  const IconComponent = nodeType.icon
                  const isCustomIcon = nodeType.id === 'aap'

                  return (
                    <StackItem key={nodeType.id}>
                      <CompassPanel
                        isScrollable={false}
                        onClick={() => handleNodeClick(nodeType.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            handleNodeClick(nodeType.id)
                          }
                        }}
                        style={{ cursor: 'pointer' }}
                        role="button"
                        tabIndex={0}
                        aria-label={nodeType.label}
                      >
                        <PanelMain>
                          <PanelMainBody>
                            <Stack hasGutter>
                              <StackItem>
                                <Split hasGutter>
                                  <SplitItem isFilled={false} style={{ width: '1.5rem', flexShrink: 0 }}>
                                    {isCustomIcon ? (
                                      <IconComponent
                                        style={{
                                          width: '1.5rem',
                                          height: '1.5rem',
                                          display: 'block',
                                        }}
                                      />
                                    ) : (
                                      <Icon>
                                        <IconComponent />
                                      </Icon>
                                    )}
                                  </SplitItem>
                                  <SplitItem>
                                    <Title headingLevel="h3" size="md">
                                      {nodeType.label}
                                    </Title>
                                  </SplitItem>
                                </Split>
                              </StackItem>
                              <StackItem>
                                {nodeType.description && (
                                  <Content>
                                    <small>{nodeType.description}</small>
                                  </Content>
                                )}
                              </StackItem>
                            </Stack>
                          </PanelMainBody>
                        </PanelMain>
                      </CompassPanel>
                    </StackItem>
                  )
                })}
          </Stack>
        </StackItem>
      </Stack>
    </CompassPanel>
  )
}
