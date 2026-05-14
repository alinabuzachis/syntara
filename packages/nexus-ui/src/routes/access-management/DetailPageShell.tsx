import type { ReactNode } from 'react'

import type { AppBreadcrumbItem } from '../../app/breadcrumbs/appBreadcrumbItem'
import { NxPage, NxPageBody } from '../../components/layout/NxPage'
import { NxPageHeader } from '../../components/layout/NxPageHeader'
import { NxPanel } from '../../components/layout/NxPanel'

type DetailPageShellProps = {
  title: string
  children: ReactNode
  breadcrumbs?: readonly AppBreadcrumbItem[]
}

/**
 * Shared shell for detail page early-return states (loading, error, not-found).
 * Wraps content in the standard NxPage → NxPageHeader → full-height Panel layout
 * so each detail page does not duplicate the same structure.
 */
export function DetailPageShell({ title, children, breadcrumbs }: Readonly<DetailPageShellProps>) {
  return (
    <NxPage>
      <NxPageHeader title={title} breadcrumbs={breadcrumbs} />
      <NxPageBody>
        <NxPanel isFullHeight>{children}</NxPanel>
      </NxPageBody>
    </NxPage>
  )
}
