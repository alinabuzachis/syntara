import { breadcrumbsIdentityProvidersPage } from '../../../app/breadcrumbBuilders'
import { EmptyStateAccessDenied } from '../../../components/EmptyStateAccessDenied'
import { NxPage, NxPageBody } from '../../../components/layout/NxPage'
import { NxPageHeader } from '../../../components/layout/NxPageHeader'
import { NxPanel } from '../../../components/layout/NxPanel'
import { useCanI } from '../../../hooks/useCanI'

import { IdentityProvidersTab } from './IdentityProvidersTab'

export default function Authentication() {
  const { allowed: canRead, isChecking } = useCanI('read', 'identity-provider')

  if (isChecking) {
    return (
      <NxPage>
        <NxPageHeader title="Identity Providers" breadcrumbs={breadcrumbsIdentityProvidersPage()} />
        <NxPageBody>
          <NxPanel isFullHeight />
        </NxPageBody>
      </NxPage>
    )
  }

  if (!canRead) {
    return (
      <NxPage>
        <NxPageHeader title="Identity Providers" breadcrumbs={breadcrumbsIdentityProvidersPage()} />
        <NxPageBody>
          <NxPanel isFullHeight>
            <EmptyStateAccessDenied description="You don't have permission to view identity providers. Contact your administrator to request access." />
          </NxPanel>
        </NxPageBody>
      </NxPage>
    )
  }

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
