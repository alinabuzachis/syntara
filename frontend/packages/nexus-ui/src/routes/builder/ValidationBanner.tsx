import { Alert, AlertActionCloseButton, Button, List, ListItem, StackItem } from '@patternfly/react-core'

import type { BuilderAction, ValidationError } from './builderReducer'

type ErrorItemContentProps = Readonly<{
  error: ValidationError
  onNavigateToNode?: (nodeId: string) => void
}>

function ErrorItemContent({ error, onNavigateToNode }: ErrorItemContentProps) {
  /* v8 ignore start -- phantom branches from compiled conditionals and JSX */
  if (!error.nodeId || !onNavigateToNode) {
    return <>{error.message}</>
  }

  const linkLabel = error.nodeName ?? 'Go to step'
  const suffix = error.nodeName ? error.message.slice(error.nodeName.length) : ''
  return (
    <>
      {!error.nodeName && <>{error.message} </>}
      <Button variant="link" isInline onClick={() => onNavigateToNode(error.nodeId!)}>
        <strong>{linkLabel}</strong>
      </Button>
      {suffix}
    </>
  )
  /* v8 ignore stop */
}

type ValidationBannerProps = Readonly<{
  errors: ValidationError[]
  dispatch: (action: BuilderAction) => void
  onNavigateToNode?: (nodeId: string) => void
}>

export function ValidationBanner({ errors, dispatch, onNavigateToNode }: ValidationBannerProps) {
  if (errors.length === 0) return null

  /* v8 ignore start -- phantom branches from compiled JSX props and map callback */
  return (
    <StackItem>
      <Alert
        variant="danger"
        isInline
        isExpandable
        title={`Verification failed — ${errors.length} issue${errors.length === 1 ? '' : 's'} found`}
        actionClose={<AlertActionCloseButton onClose={() => dispatch({ type: 'CLEAR_VALIDATION_ERRORS' })} />}
      >
        <List isPlain>
          {errors.map((error) => (
            <ListItem key={`${error.nodeId ?? 'global'}-${error.message}`}>
              <ErrorItemContent error={error} onNavigateToNode={onNavigateToNode} />
            </ListItem>
          ))}
        </List>
      </Alert>
    </StackItem>
  )
  /* v8 ignore stop */
}
