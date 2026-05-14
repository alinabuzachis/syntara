import { breadcrumbsIdentityProvidersPage } from '../../../app/breadcrumbBuilders'
import { NxPage, NxPageBody } from '../../../components/layout/NxPage'
import { NxPageHeader } from '../../../components/layout/NxPageHeader'
import { NxPanel } from '../../../components/layout/NxPanel'

import { IdentityProvidersTab } from './IdentityProvidersTab'

export default function Authentication() {
  return (
    <NxPage>
      <NxPageHeader title="Identity Providers" breadcrumbs={breadcrumbsIdentityProvidersPage()} />
      <NxPageBody>
        <NxPanel isFullHeight>
          <IdentityProvidersTab />
        </NxPanel>
      </NxPageBody>
    </NxPage>
  )
}
