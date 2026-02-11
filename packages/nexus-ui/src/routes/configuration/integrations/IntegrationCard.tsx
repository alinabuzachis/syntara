import type { ToolProvider } from '@ansible/nexus-contracts'
import {
  CompassPanel,
  Divider,
  Dropdown,
  DropdownItem,
  DropdownList,
  Flex,
  FlexItem,
  MenuToggle,
  Title,
} from '@patternfly/react-core'
import type { MenuToggleElement } from '@patternfly/react-core'
import { RhUiCheckCircleIcon, RhUiViewIcon, RhUiEllipsisVerticalFillIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { useState } from 'react'

import { IconLabel } from '../../../components/IconLabel'

interface IntegrationCardProps {
  integration: ToolProvider
  onViewTools: () => void
  onValidateConnection: () => void
  onUninstall: () => void
}

export function IntegrationCard({ integration, onViewTools, onValidateConnection, onUninstall }: IntegrationCardProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const handleAction = (action: () => void) => {
    setIsMenuOpen(false)
    action()
  }

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
        <DropdownItem key="view-tools" onClick={() => handleAction(onViewTools)}>
          <IconLabel icon={<RhUiViewIcon />}>View and enable/disable tools</IconLabel>
        </DropdownItem>
        <DropdownItem key="validate" onClick={() => handleAction(onValidateConnection)}>
          <IconLabel icon={<RhUiCheckCircleIcon />}>Validate connection</IconLabel>
        </DropdownItem>
        <Divider component="li" key="separator" />
        <DropdownItem key="uninstall" onClick={() => handleAction(onUninstall)}>
          <IconLabel icon={<RhUiTrashIcon />}>Uninstall</IconLabel>
        </DropdownItem>
      </DropdownList>
    </Dropdown>
  )
  return (
    <CompassPanel style={{ padding: 'var(--pf-t--global--spacer--lg)' }}>
      <Flex direction={{ default: 'column' }} gap={{ default: 'gapMd' }}>
        <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
          <Title headingLevel="h3">{integration.name}</Title>
          <FlexItem>{headerActions}</FlexItem>
        </Flex>
        <div>{integration.description}</div>
      </Flex>
    </CompassPanel>
  )
}
