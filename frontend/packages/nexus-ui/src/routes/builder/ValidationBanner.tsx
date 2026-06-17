import { Alert, AlertActionCloseButton, List, ListItem, StackItem } from '@patternfly/react-core'

import type { BuilderAction, ValidationError } from './builderReducer'

type ValidationBannerProps = Readonly<{
  errors: ValidationError[]
  dispatch: (action: BuilderAction) => void
}>

export function ValidationBanner({ errors, dispatch }: ValidationBannerProps) {
  if (errors.length === 0) return null

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
            <ListItem key={`${error.nodeId ?? 'global'}-${error.message}`}>{error.message}</ListItem>
          ))}
        </List>
      </Alert>
    </StackItem>
  )
}
