import { Stack, StackItem } from '@patternfly/react-core'
import { useNavigate } from '@tanstack/react-router'
import type { CSSProperties, ReactNode } from 'react'

import { AppRoute } from '../../app/AppRoute'
import { panelContentStackStyle } from '../../app/panelContentStackStyle'
import { detachPromise } from '../../utils/detachPromise'
import { NxEmptyStateViewportTooSmall } from '../states/NxEmptyStateViewportTooSmall'

import styles from './NxReactFlowViewportGuard.module.css'

type NxReactFlowViewportGuardProps = {
  children: ReactNode
  /** Callback when user clicks the return button in the empty state. Defaults to navigating to Workflows. */
  onReturn?: () => void
}

const guardContentStyle: CSSProperties = { ...panelContentStackStyle, padding: '0 var(--pf-t--global--spacer--sm)' }

/** Hides page content and shows a full-page empty state when the viewport is below 720p (nav bar remains visible). */
export function NxReactFlowViewportGuard({ children, onReturn }: NxReactFlowViewportGuardProps) {
  const navigate = useNavigate()
  const handleReturn = onReturn ?? (() => detachPromise(navigate({ to: AppRoute.Workflows.Root })))

  return (
    <Stack style={panelContentStackStyle}>
      <StackItem isFilled className={styles.content}>
        <Stack hasGutter style={guardContentStyle}>
          {children}
        </Stack>
      </StackItem>
      <StackItem isFilled className={styles.emptyState} data-testid="viewport-guard-empty-state">
        <NxEmptyStateViewportTooSmall onReturn={handleReturn} />
      </StackItem>
    </Stack>
  )
}
