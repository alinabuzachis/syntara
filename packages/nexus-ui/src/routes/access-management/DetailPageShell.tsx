import type { ReactNode } from 'react'

import { AppPage, AppPageMain } from '../../app/AppPage'
import { AppPageHeader } from '../../app/AppPageHeader'
import type { AppBreadcrumbItem } from '../../app/breadcrumbs/appBreadcrumbItem'
import { AppPanel } from '../../components/AppPanel'

type DetailPageShellProps = {
  title: string
  children: ReactNode
  breadcrumbs?: readonly AppBreadcrumbItem[]
}

/**
 * Shared shell for detail page early-return states (loading, error, not-found).
 * Wraps content in the standard AppPage → AppPageHeader → full-height Panel layout
 * so each detail page does not duplicate the same structure.
 */
export function DetailPageShell({ title, children, breadcrumbs }: Readonly<DetailPageShellProps>) {
  return (
    <AppPage>
      <AppPageHeader title={title} breadcrumbs={breadcrumbs} />
      <AppPageMain>
        <AppPanel isFullHeight>{children}</AppPanel>
      </AppPageMain>
    </AppPage>
  )
}
