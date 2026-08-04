import { Alert, StackItem } from '@patternfly/react-core'

type BuilderReadOnlyBannerProps = Readonly<{
  canEdit: boolean
  isLoading: boolean
  isBuiltin: boolean
}>

export function BuilderReadOnlyBanner({ canEdit, isLoading, isBuiltin }: BuilderReadOnlyBannerProps) {
  if (canEdit || isLoading) return null

  return (
    <StackItem>
      <Alert
        variant="info"
        isInline
        title={isBuiltin ? 'This is a built-in workflow.' : 'You are viewing this workflow in read-only mode.'}
      >
        {isBuiltin
          ? 'Built-in workflows cannot be modified.'
          : 'You do not have permission to edit this workflow. Contact your administrator to request access.'}
      </Alert>
    </StackItem>
  )
}
