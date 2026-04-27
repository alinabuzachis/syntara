import { StackItem } from '@patternfly/react-core'
import type { ReactNode } from 'react'

import { AppPage } from '../../app/AppPage'
import { AppPageHeader } from '../../app/AppPageHeader'
import { AppPanel } from '../../components/AppPanel'

type DetailPageShellProps = {
  title: ReactNode
  children: ReactNode
}

/**
 * Shared shell for detail page early-return states (loading, error, not-found).
 * Wraps content in the standard AppPage → AppPageHeader → full-height Panel layout
 * so each detail page does not duplicate the same structure.
 */
export function DetailPageShell({ title, children }: Readonly<DetailPageShellProps>) {
  return (
    <AppPage>
      <AppPageHeader title={title} />
      <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
        <AppPanel isFullHeight>{children}</AppPanel>
      </StackItem>
    </AppPage>
  )
}
