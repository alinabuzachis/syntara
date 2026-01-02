import { Button, Flex, FlexItem, Icon } from '@patternfly/react-core'

import type { NodeTypeDefinition } from '../registry/NodeRegistry'

interface NodeTypeButtonProps {
  nodeType: NodeTypeDefinition
  isSelected: boolean
  onClick: () => void
}

export function NodeTypeButton({ nodeType, isSelected, onClick }: NodeTypeButtonProps) {
  const IconComponent = nodeType.icon

  return (
    <Button
      variant={isSelected ? 'primary' : 'secondary'}
      onClick={onClick}
      title={nodeType.description}
      style={{ width: '100%' }}
    >
      <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
        <FlexItem>
          <Icon>
            <IconComponent />
          </Icon>
        </FlexItem>
        <FlexItem>
          {nodeType.label}
          {nodeType.description && <div style={{ fontSize: '0.625rem', opacity: 0.7 }}>{nodeType.description}</div>}
        </FlexItem>
      </Flex>
    </Button>
  )
}
