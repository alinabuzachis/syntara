import { EmptyState, EmptyStateBody } from '@patternfly/react-core'

export interface InputEmptyStateProps {
  variant: 'not-connected' | 'connected-not-run'
}

export function InputEmptyState({ variant }: Readonly<InputEmptyStateProps>) {
  if (variant === 'not-connected') {
    return (
      <EmptyState headingLevel="h2" titleText="No input data">
        <EmptyStateBody>Input data can only be displayed when a node is connected and run</EmptyStateBody>
      </EmptyState>
    )
  }

  return (
    <EmptyState headingLevel="h2" titleText="Input not available">
      <EmptyStateBody>Run previous node to populate input</EmptyStateBody>
    </EmptyState>
  )
}
