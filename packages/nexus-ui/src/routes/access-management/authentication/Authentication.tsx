import { AppPage, AppPageMain } from '../../../app/AppPage'
import { AppPageHeader } from '../../../app/AppPageHeader'
import { AppPanel } from '../../../components/AppPanel'

import { IdentityProvidersTab } from './IdentityProvidersTab'

export default function Authentication() {
  return (
    <AppPage>
      <AppPageHeader title="Identity Providers" />
      <AppPageMain>
        <AppPanel isFullHeight>
          <IdentityProvidersTab />
        </AppPanel>
      </AppPageMain>
    </AppPage>
  )
}
