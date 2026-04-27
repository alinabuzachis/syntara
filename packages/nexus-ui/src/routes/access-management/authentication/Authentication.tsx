import { Card, CardBody, Divider, Flex, FlexItem, Label, Stack, StackItem, Switch } from '@patternfly/react-core'
import { RhUiCheckCircleIcon, RhUiUnlockIcon } from '@patternfly/react-icons'

import { AppPage } from '../../../app/AppPage'
import { AppPageHeader } from '../../../app/AppPageHeader'
import { AppPanel } from '../../../components/AppPanel'

import { IdentityProvidersTab } from './IdentityProvidersTab'

function BuiltInAdminCard() {
  return (
    <Card isCompact>
      <CardBody>
        <Flex alignItems={{ default: 'alignItemsCenter' }}>
          <FlexItem>
            <RhUiUnlockIcon aria-hidden="true" />
          </FlexItem>
          <FlexItem>
            <strong>Built-in Administrator Account</strong>
          </FlexItem>
          <FlexItem>
            <Label status="success" icon={<RhUiCheckCircleIcon />} isCompact>
              Enabled
            </Label>
          </FlexItem>
          <FlexItem>
            Username: <strong>admin</strong>
          </FlexItem>
          <FlexItem align={{ default: 'alignRight' }}>
            <Switch
              id="admin-enabled"
              aria-label="Built-in administrator account enabled (cannot be disabled)"
              label="Enabled"
              isChecked
              isDisabled
            />
          </FlexItem>
        </Flex>
      </CardBody>
    </Card>
  )
}

export default function Authentication() {
  return (
    <AppPage>
      <AppPageHeader title="Identity Providers" />
      <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
        <AppPanel isFullHeight>
          <Stack hasGutter>
            <StackItem>
              <BuiltInAdminCard />
            </StackItem>
            <StackItem>
              <Divider />
            </StackItem>
            <StackItem isFilled>
              <IdentityProvidersTab />
            </StackItem>
          </Stack>
        </AppPanel>
      </StackItem>
    </AppPage>
  )
}
