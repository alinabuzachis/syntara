import { Card, CardBody, Flex, FlexItem, Switch, Tooltip } from '@patternfly/react-core'
import { RhUiCheckCircleIcon, RhUiLockIcon, RhUiUnlockIcon } from '@patternfly/react-icons'

import { NxLabel } from '../../components/labels/NxLabel'
import { NxLink } from '../../components/NxLink'

import { getUserDetailPath } from './accessManagementPaths'
import { BUILTIN_ADMIN_TOGGLE_DISABLED_REASON } from './adminConstants'

type BuiltInAdminCardProps = {
  userId: string
  isEnabled: boolean
  canToggle: boolean
  onToggle: (checked: boolean) => void
}

export function BuiltInAdminCard({ userId, isEnabled, canToggle, onToggle }: Readonly<BuiltInAdminCardProps>) {
  const adminSwitch = (
    <Switch
      id="admin-enabled"
      aria-label={`Built-in administrator account ${isEnabled ? 'enabled' : 'disabled'}`}
      label={isEnabled ? 'Enabled' : 'Disabled'}
      isChecked={isEnabled}
      isDisabled={!canToggle}
      onChange={(_event, checked) => onToggle(checked)}
    />
  )

  return (
    <Card isCompact>
      <CardBody>
        <Flex alignItems={{ default: 'alignItemsCenter' }}>
          <FlexItem>{isEnabled ? <RhUiUnlockIcon aria-hidden="true" /> : <RhUiLockIcon aria-hidden="true" />}</FlexItem>
          <FlexItem>
            <NxLink to={getUserDetailPath(userId)}>
              <strong>Built-in Administrator Account</strong>
            </NxLink>
          </FlexItem>
          <FlexItem>
            {/* Intentionally inverted: "Disabled" is the desired/green state for the built-in admin account */}
            <NxLabel variant="outline" status={isEnabled ? 'danger' : 'success'} icon={<RhUiCheckCircleIcon />}>
              {isEnabled ? 'Enabled' : 'Disabled'}
            </NxLabel>
          </FlexItem>
          <FlexItem>
            Username: <strong>admin</strong>
          </FlexItem>
          <FlexItem align={{ default: 'alignRight' }}>
            {canToggle ? (
              adminSwitch
            ) : (
              <Tooltip content={BUILTIN_ADMIN_TOGGLE_DISABLED_REASON}>
                {/* role="group" makes the span interactive so keyboard users can discover the tooltip */}
                {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
                <span tabIndex={0}>{adminSwitch}</span>
              </Tooltip>
            )}
          </FlexItem>
        </Flex>
      </CardBody>
    </Card>
  )
}
