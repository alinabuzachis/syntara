import { AppPage, AppPageMain } from '../../../app/AppPage'
import { AppPageHeader } from '../../../app/AppPageHeader'
import { breadcrumbsIdentityProvidersPage } from '../../../app/breadcrumbBuilders'
import { AppPanel } from '../../../components/AppPanel'

import { IdentityProvidersTab } from './IdentityProvidersTab'

export default function Authentication() {
  return (
    <AppPage>
      <AppPageHeader title="Identity Providers" breadcrumbs={breadcrumbsIdentityProvidersPage()} />
      <AppPageMain>
        <AppPanel isFullHeight>
          <IdentityProvidersTab />
        </AppPanel>
      </AppPageMain>
    </AppPage>
  )
}
