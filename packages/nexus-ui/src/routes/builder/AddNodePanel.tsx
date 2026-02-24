import { Button, CompassPanel, Flex, FlexItem, Icon, Stack, StackItem, Title, TitleSizes } from '@patternfly/react-core'
import { RhUiCloseIcon, RhUiArrowLeftIcon, RhUiAddSquareIcon } from '@patternfly/react-icons'
import { useMemo, useState } from 'react'

import { NodeTypeOptionsList } from './NodeTypeOptionsList'
import { NodeRegistry } from './registry/NodeRegistry'

interface AddNodePanelProps {
  onClose: () => void
  onSelectNode: (nodeTypeId: string, nodeSubtypeId?: string | null) => void
  sourceNodeId?: string | null
  /** Project has no nodes in the builder */
  hasNoWorkflowNodes?: boolean
  /** ID of the node to replace (for generic node conversion) */
  replacementNodeId?: string | null
}

export function AddNodePanel(props: AddNodePanelProps) {
  const [selectedNodeType, setSelectedNodeType] = useState<string | null>(null)

  // Get all registered node types
  // Filter out trigger nodes when adding via plus icon (sourceNodeId exists)
  // OR when replacing a generic node (replacementNodeId exists)
  // because triggers cannot be target nodes
  const nodeTypes = useMemo(() => {
    const allNodes = NodeRegistry.getAll()
    if (props.hasNoWorkflowNodes) {
      return allNodes.filter((node) => node.category === 'trigger')
    }
    if (props.sourceNodeId || props.replacementNodeId) {
      return allNodes.filter((node) => node.category !== 'trigger')
    }
    return allNodes
  }, [props.replacementNodeId, props.hasNoWorkflowNodes, props.sourceNodeId])

  const handleNodeClick = (nodeId: string) => {
    const nodeDef = NodeRegistry.get(nodeId)
    if (nodeDef?.subtypes?.length) {
      setSelectedNodeType(nodeId)
      return
    }
    props.onSelectNode(nodeId, null)
    setSelectedNodeType(null)
  }

  // Get the selected node type definition
  const enforcedSelectedNodeType = props.hasNoWorkflowNodes ? 'trigger' : selectedNodeType
  const selectedNode = enforcedSelectedNodeType ? NodeRegistry.get(enforcedSelectedNodeType) : null
  const isShowingSubtypeList = !!selectedNode?.subtypes?.length

  const panelTitle =
    isShowingSubtypeList && selectedNode ? (selectedNode.selectionTitle ?? 'Select a node') : 'Add node'

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
                  {isShowingSubtypeList && !props.hasNoWorkflowNodes ? (
                    <Button
                      variant="plain"
                      onClick={() => {
                        setSelectedNodeType(null)
                      }}
                      aria-label="Back"
                    >
                      <Icon>
                        <RhUiArrowLeftIcon />
                      </Icon>
                    </Button>
                  ) : !isShowingSubtypeList ? (
                    <Icon>
                      <RhUiAddSquareIcon />
                    </Icon>
                  ) : null}
                </FlexItem>
                <FlexItem>
                  <Title headingLevel="h2" size={TitleSizes.lg}>
                    {panelTitle}
                  </Title>
                </FlexItem>
              </Flex>
            </FlexItem>
            {!props.hasNoWorkflowNodes && (
              <FlexItem>
                <Button variant="plain" onClick={props.onClose} aria-label="Close">
                  <Icon>
                    <RhUiCloseIcon />
                  </Icon>
                </Button>
              </FlexItem>
            )}
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
            {selectedNode && selectedNode.subtypes?.length ? (
              <NodeTypeOptionsList
                nodeTypes={selectedNode.subtypes
                  .map((subtype, index) => ({ subtype, index }))
                  .sort((a, b) => (a.subtype.order ?? a.index) - (b.subtype.order ?? b.index))
                  .map(({ subtype }) => subtype)}
                onSelect={(subtypeId) => {
                  props.onSelectNode(selectedNode.id, subtypeId)
                  setSelectedNodeType(null)
                }}
              />
            ) : (
              <NodeTypeOptionsList nodeTypes={nodeTypes} onSelect={handleNodeClick} />
            )}
          </Stack>
        </StackItem>
      </Stack>
    </CompassPanel>
  )
}
