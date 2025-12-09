import type { ToolProvider } from '@ansible/nexus-contracts'
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
} from '@patternfly/react-core'
import type { MenuToggleElement } from '@patternfly/react-core'
import { EllipsisVIcon } from '@patternfly/react-icons'
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
          <EllipsisVIcon />
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
    <Card isPlain className="glass">
      <CardHeader actions={{ actions: headerActions }}>
        <CardTitle>{props.integration.name}</CardTitle>
      </CardHeader>
      <CardBody>
        <div id="description">{props.integration.description}</div>
      </CardBody>
    </Card>
  )
}
