import type { ToolProvider } from '@ansible/nexus-contracts'
import {
  CompassPanel,
  Dropdown,
  DropdownItem,
  DropdownList,
  Flex,
  FlexItem,
  MenuToggle,
  Title,
} from '@patternfly/react-core'
import type { MenuToggleElement } from '@patternfly/react-core'
import { RhUiEllipsisVerticalFillIcon } from '@patternfly/react-icons'
import { useState } from 'react'

export function IntegrationCard(props: { integration: ToolProvider }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const headerActions = (
    <Dropdown
      isOpen={isMenuOpen}
      onOpenChange={(isOpen) => setIsMenuOpen(isOpen)}
      toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
        <MenuToggle
          ref={toggleRef}
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          isExpanded={isMenuOpen}
          variant="plain"
          aria-label="Card actions"
        >
          <RhUiEllipsisVerticalFillIcon />
        </MenuToggle>
      )}
    >
      <DropdownList>
        <DropdownItem key="start" onClick={() => setIsMenuOpen(false)}>
          Start Server
        </DropdownItem>
        <DropdownItem key="stop" onClick={() => setIsMenuOpen(false)}>
          Stop Server
        </DropdownItem>
        <DropdownItem key="remove" onClick={() => setIsMenuOpen(false)}>
          Remove Server
        </DropdownItem>
      </DropdownList>
    </Dropdown>
  )
  return (
    <CompassPanel style={{ padding: 'var(--pf-t--global--spacer--lg)' }}>
      <Flex direction={{ default: 'column' }} gap={{ default: 'gapMd' }}>
        <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
          <Title headingLevel="h3">{props.integration.name}</Title>
          <FlexItem>{headerActions}</FlexItem>
        </Flex>
        <div>{props.integration.description}</div>
      </Flex>
    </CompassPanel>
  )
}
