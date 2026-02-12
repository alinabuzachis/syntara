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
import type { ComponentType, CSSProperties } from 'react'

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
    const shouldRotateIcon = nodeType.id === 'logic-condition' || nodeType.id === 'logic-converge'
    const iconStyle: CSSProperties = {
      width: '1.5rem',
      height: '1.5rem',
      display: 'block',
      ...(shouldRotateIcon ? { transform: 'rotate(90deg)' } : {}),
    }

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
                          const StyledIcon = IconComponent as ComponentType<{ style?: CSSProperties }>
                          return <StyledIcon style={iconStyle} />
                        })()
                      ) : (
                        <Icon style={iconStyle}>
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
