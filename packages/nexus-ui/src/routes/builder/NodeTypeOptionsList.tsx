import {
  CompassPanel,
  Content,
  Flex,
  FlexItem,
  Label,
  PanelMain,
  PanelMainBody,
  Split,
  SplitItem,
  Stack,
  StackItem,
  Title,
} from '@patternfly/react-core'

import { RegistryNodeId } from '../../constants'
import { renderNodeIcon } from '../automations/canvas/nodes/renderNodeIcon'
import { getAddNodePanelColor } from '../automations/canvas/nodeTypeColors'

import type { NodeSubtypeDefinition, NodeTypeDefinition } from './registry/NodeRegistry'
import { resolveIconForType } from './utils/nodeIcons'

export type NodeTypeOption = Pick<NodeTypeDefinition | NodeSubtypeDefinition, 'id' | 'label' | 'icon' | 'description'>

interface NodeTypeOptionsListProps {
  nodeTypes: NodeTypeOption[]
  onSelect: (nodeId: string) => void
}

export function NodeTypeOptionsList(props: NodeTypeOptionsListProps) {
  return props.nodeTypes.map((nodeType) => {
    const { icon, id } = resolveIconForType({ nodeTypeId: nodeType.id })
    const accentColor = getAddNodePanelColor(nodeType.id)
    const iconColor = nodeType.id === RegistryNodeId.AAP ? undefined : accentColor
    const nodeIcon = renderNodeIcon(icon, id, 'list', iconColor)

    return (
      <StackItem key={nodeType.id}>
        <CompassPanel
          isScrollable={false}
          onClick={() => props.onSelect(nodeType.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              props.onSelect(nodeType.id)
            }
          }}
          style={{
            cursor: 'pointer',
            ...(accentColor
              ? {
                  border: 'none',
                  borderTopWidth: 4,
                  borderTopStyle: 'solid',
                  borderTopColor: accentColor,
                }
              : {}),
          }}
          role="button"
          tabIndex={0}
          aria-label={nodeType.label}
        >
          <PanelMain>
            <PanelMainBody>
              <Stack hasGutter>
                <StackItem>
                  <Split hasGutter>
                    <SplitItem isFilled={false} style={{ width: '2rem', flexShrink: 0 }}>
                      {nodeIcon}
                    </SplitItem>
                    <SplitItem isFilled>
                      <Flex
                        alignItems={{ default: 'alignItemsCenter' }}
                        gap={{ default: 'gapSm' }}
                        flexWrap={{ default: 'nowrap' }}
                      >
                        <FlexItem flex={{ default: 'flexNone' }}>
                          <Title headingLevel="h3" size="md">
                            {nodeType.label}
                          </Title>
                        </FlexItem>
                        {nodeType.id === RegistryNodeId.ACTION_SCRIPT && (
                          <FlexItem>
                            <Label isCompact color="purple">
                              NOT SCOPED FOR GA
                            </Label>
                          </FlexItem>
                        )}
                      </Flex>
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
  })
}
