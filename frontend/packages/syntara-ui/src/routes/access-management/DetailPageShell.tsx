import type { ReactNode } from 'react'

import type { AppBreadcrumbItem } from '../../app/breadcrumbs/appBreadcrumbItem'
import { NxPage, NxPageBody } from '../../components/layout/NxPage'
import { NxPageHeader } from '../../components/layout/NxPageHeader'
import { NxPanel } from '../../components/layout/NxPanel'
import { NxPageTitle } from '../../components/NxPageTitle'

type DetailPageShellProps = {
  title: string
  children: ReactNode
  breadcrumbs?: readonly AppBreadcrumbItem[]
  docLink?: string
}

/**
 * Shared shell for detail page early-return states (loading, error, not-found).
 * Wraps content in the standard NxPage → NxPageHeader → full-height Panel layout
 * so each detail page does not duplicate the same structure.
 */
export function DetailPageShell({ title, children, breadcrumbs, docLink }: Readonly<DetailPageShellProps>) {
  return (
    <NxPage>
      <NxPageTitle segments={[title]} />
      <NxPageHeader title={title} breadcrumbs={breadcrumbs} docLink={docLink} />
      <NxPageBody>
        <NxPanel isFullHeight>{children}</NxPanel>
      </NxPageBody>
    </NxPage>
  )
}
