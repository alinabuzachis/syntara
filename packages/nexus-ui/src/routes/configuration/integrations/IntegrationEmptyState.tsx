import { CompassPanel } from '@ansible/nexus-ui-framework'
import { Flex, FlexItem, Button, Content, ContentVariants, Title } from '@patternfly/react-core'
import { navigate } from 'wouter/use-browser-location'

import { AppRoute } from '../../../app/AppRoute.tsx'

export function IntegrationEmptyState() {
  return (
    <CompassPanel glass isFullHeight>
      <Flex
        alignItems={{ default: 'alignItemsCenter' }}
        justifyContent={{ default: 'justifyContentFlexStart' }}
        gap={{ default: 'gap2xl' }}
        flexWrap={{ default: 'nowrap' }}
        style={{ padding: 'var(--pf-t--global--spacer--2xl)', height: '100%' }}
      >
        <FlexItem>
          <img
            src="/src/assets/collage-circle-sparkles-window-server-dark-RH.png"
            alt="No data"
            style={{ maxWidth: '400px', height: 'auto', objectFit: 'contain' }}
          />
        </FlexItem>
        <FlexItem style={{ maxWidth: '620px' }}>
          <Flex
            direction={{ default: 'column' }}
            alignItems={{ default: 'alignItemsFlexStart' }}
            gap={{ default: 'gapMd' }}
          >
            <Title headingLevel="h2" size="lg">
              No integrations have been configured yet.
            </Title>
            <Content component={ContentVariants.p}>
              Configure integrations to use them in automation. Integrations will allow for monitoring of server health
              and performance metrics, view server logs, and manage server settings and configurations.
            </Content>
            <Button variant="primary" onClick={() => navigate(AppRoute.Configuration.Integrations.Configure)}>
              Add Integration
            </Button>
          </Flex>
        </FlexItem>
      </Flex>
    </CompassPanel>
  )
}
