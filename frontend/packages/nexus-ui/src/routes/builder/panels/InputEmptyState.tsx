import { EmptyState, EmptyStateBody } from '@patternfly/react-core'

export type InputEmptyStateProps = {
  variant: 'not-connected' | 'connected-not-run' | 'no-trigger-schema'
}

export function InputEmptyState({ variant }: Readonly<InputEmptyStateProps>) {
  if (variant === 'not-connected') {
    return (
      <EmptyState headingLevel="h3" titleText="No input data" variant="xs">
        <EmptyStateBody>Input data can only be displayed when a step is connected and run</EmptyStateBody>
      </EmptyState>
    )
  }

  if (variant === 'no-trigger-schema') {
    return (
      <EmptyState headingLevel="h3" titleText="No schema defined" variant="xs">
        <EmptyStateBody>Add an input schema in the trigger configuration to see expected fields here</EmptyStateBody>
      </EmptyState>
    )
  }

  return (
    <EmptyState headingLevel="h3" titleText="Input not available" variant="xs">
      <EmptyStateBody>Run previous step to populate input</EmptyStateBody>
    </EmptyState>
  )
}
