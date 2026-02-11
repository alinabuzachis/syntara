import {
  CompassPanel,
  Content,
  Icon,
  PanelMain,
  PanelMainBody,
  Split,
  SplitItem,
  Stack,
  StackItem,
  Title,
} from '@patternfly/react-core'
import type { ComponentType } from 'react'

import type { NodeSubtypeDefinition, NodeTypeDefinition } from './registry/NodeRegistry'

export type NodeTypeOption = Pick<NodeTypeDefinition | NodeSubtypeDefinition, 'id' | 'label' | 'icon' | 'description'>

interface NodeTypeOptionsListProps {
  nodeTypes: NodeTypeOption[]
  onSelect: (nodeId: string) => void
}

export function NodeTypeOptionsList(props: NodeTypeOptionsListProps) {
  return props.nodeTypes.map((nodeType) => {
    const IconComponent = nodeType.icon
    const isCustomIcon = nodeType.id === 'aap'

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
                        (() => {
                          const StyledIcon = IconComponent as ComponentType<{ style?: React.CSSProperties }>
                          return (
                            <StyledIcon
                              style={{
                                width: '1.5rem',
                                height: '1.5rem',
                                display: 'block',
                              }}
                            />
                          )
                        })()
                      ) : (
                        <Icon style={{ width: '1.5rem', height: '1.5rem' }}>
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
  })
}
