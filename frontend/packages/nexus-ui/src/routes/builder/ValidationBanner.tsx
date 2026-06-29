import {
  Alert,
  AlertActionCloseButton,
  Button,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  List,
  ListItem,
  StackItem,
} from '@patternfly/react-core'
import { useMemo } from 'react'

import type { BuilderAction, ValidationError } from './builderReducer'
import {
  humanizeValidationMessage,
  mergeHumanizedMessages,
  parseValidationMessage,
} from './utils/validation/parseValidationMessage'

type ErrorGroup = {
  displayKey: string
  nodeId: string | null
  messages: string[]
}

function groupErrors(errors: ValidationError[]): ErrorGroup[] {
  const groups = new Map<string, ErrorGroup>()
  for (const error of errors) {
    const parsed = parseValidationMessage(error.message)
    const groupKey = error.nodeId ?? parsed.key
    const existing = groups.get(groupKey)
    if (existing) {
      existing.messages.push(...parsed.messages)
    } else {
      groups.set(groupKey, {
        displayKey: error.nodeName ?? parsed.displayKey,
        nodeId: error.nodeId,
        messages: [...parsed.messages],
      })
    }
  }

  return [...groups.values()].map((group) => ({
    ...group,
    messages: mergeHumanizedMessages(group.messages.map(humanizeValidationMessage)),
  }))
}

type ValidationBannerProps = Readonly<{
  errors: ValidationError[]
  dismissed: boolean
  dispatch: (action: BuilderAction) => void
  onNavigateToNode?: (nodeId: string) => void
}>

export function ValidationBanner({ errors, dismissed, dispatch, onNavigateToNode }: ValidationBannerProps) {
  const groups = useMemo(() => groupErrors(errors), [errors])
  const hasErrors = errors.some((e) => e.severity !== 'warning')
  const variant = hasErrors ? 'danger' : 'warning'
  const count = errors.length
  const plural = count === 1 ? '' : 's'
  const title = hasErrors
    ? `Verification failed — ${count} issue${plural} found`
    : `Saved with ${count} warning${plural}`

  if (errors.length === 0 || dismissed) return null

  /* v8 ignore start -- phantom branches from compiled JSX props and map callback */
  return (
    <StackItem>
      <Alert
        variant={variant}
        isInline
        isExpandable
        title={title}
        actionClose={<AlertActionCloseButton onClose={() => dispatch({ type: 'DISMISS_VALIDATION_BANNER' })} />}
      >
        <DescriptionList isCompact isFluid isHorizontal>
          {groups.map((group) => (
            <DescriptionListGroup key={`${group.nodeId ?? 'global'}-${group.displayKey}`}>
              <DescriptionListTerm>
                {group.nodeId && group.displayKey !== 'Workflow' && onNavigateToNode ? (
                  <Button variant="link" isInline onClick={() => onNavigateToNode(group.nodeId!)}>
                    {group.displayKey}
                  </Button>
                ) : (
                  group.displayKey
                )}
              </DescriptionListTerm>
              <DescriptionListDescription>
                {group.messages.length === 1 ? (
                  group.messages[0]
                ) : (
                  <List isPlain>
                    {group.messages.map((msg) => (
                      <ListItem key={msg}>{msg}</ListItem>
                    ))}
                  </List>
                )}
              </DescriptionListDescription>
            </DescriptionListGroup>
          ))}
        </DescriptionList>
      </Alert>
    </StackItem>
  )
  /* v8 ignore stop */
}
