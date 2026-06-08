import { Component, type ReactNode } from 'react'

import { NxPage, NxPageBody } from './layout/NxPage'
import { NxPageHeader } from './layout/NxPageHeader'
import { NxPanel } from './layout/NxPanel'
import { NxErrorState } from './states/NxErrorState'

type ErrorBoundaryProps = {
  children: ReactNode
  fallback?: ReactNode
}

type ErrorBoundaryState = {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch() {
    // Error boundary caught an error
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <NxPage>
          <NxPageHeader title="Something went wrong" />
          <NxPageBody>
            <NxPanel isFullHeight>
              <NxErrorState
                title="Something went wrong"
                message={this.state.error?.message ?? 'An unexpected error occurred'}
              />
            </NxPanel>
          </NxPageBody>
        </NxPage>
      )
    }

    return this.props.children
  }
}
