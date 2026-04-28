import { StackItem } from '@patternfly/react-core'

import { AppPage } from '../../../app/AppPage'
import { AppPageHeader } from '../../../app/AppPageHeader'
import { AppPanel } from '../../../components/AppPanel'

import { IdentityProvidersTab } from './IdentityProvidersTab'

export default function Authentication() {
  return (
    <AppPage>
      <AppPageHeader title="Identity Providers" />
      <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
        <AppPanel isFullHeight>
          <IdentityProvidersTab />
        </AppPanel>
      </StackItem>
    </AppPage>
  )
}
