import {
  Content,
  ContentVariants,
  Flex,
  FlexItem,
  Label,
  Split,
  SplitItem,
  Stack,
  StackItem,
  Title,
} from '@patternfly/react-core'

import { AppPanel } from '../../components/AppPanel'
import { RegistryNodeId } from '../../constants'
import { renderNodeIcon } from '../workflows/canvas/nodes/renderNodeIcon'
import { getAddNodePanelColor } from '../workflows/canvas/nodeTypeColors'

import type { NodeSubtypeDefinition, NodeTypeDefinition } from './registry/NodeRegistry'
import { resolveIconForType } from './utils/nodeIcons'

export type NodeTypeOption = Pick<NodeTypeDefinition | NodeSubtypeDefinition, 'id' | 'label' | 'icon' | 'description'>

type NodeTypeOptionsListProps = {
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
        <AppPanel
          isGlass={false}
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
                        <Label isCompact color="orange" style={{ fontSize: 'var(--pf-t--global--font--size--sm)' }}>
                          Developer Preview
                        </Label>
                      </FlexItem>
                    )}
                  </Flex>
                </SplitItem>
              </Split>
            </StackItem>
            <StackItem>
              {nodeType.description && <Content component={ContentVariants.small}>{nodeType.description}</Content>}
            </StackItem>
          </Stack>
        </AppPanel>
      </StackItem>
    )
  })
}
