import { Button, Flex, FlexItem, HelperText, HelperTextItem, StackItem } from '@patternfly/react-core'
import { useId } from 'react'

import { ExpandableCodeEditor } from '../components/ExpandableCodeEditor'

type InlineMockEditorProps = {
  code: string
  onCodeChange: (value: string) => void
  onPin: () => void
  onCancel: () => void
  jsonError: string | null
  height?: string
  ariaLabel?: string
  pinButtonLabel?: string
}

export function InlineMockEditor({
  code,
  onCodeChange,
  onPin,
  onCancel,
  jsonError,
  height = '25rem',
  ariaLabel = 'Mock data editor',
  pinButtonLabel = 'Pin data',
}: Readonly<InlineMockEditorProps>) {
  const errorId = useId()

  return (
    <>
      <StackItem isFilled>
        <ExpandableCodeEditor
          code={code}
          onCodeChange={onCodeChange}
          language="json"
          height={height}
          ariaLabel={ariaLabel}
        />
      </StackItem>
      {jsonError && (
        <StackItem>
          <HelperText>
            <HelperTextItem variant="error" id={errorId}>
              {jsonError}
            </HelperTextItem>
          </HelperText>
        </StackItem>
      )}
      <StackItem>
        <Flex spaceItems={{ default: 'spaceItemsSm' }}>
          <FlexItem>
            <Button variant="primary" onClick={onPin} aria-describedby={jsonError ? errorId : undefined}>
              {pinButtonLabel}
            </Button>
          </FlexItem>
          <FlexItem>
            <Button variant="link" onClick={onCancel}>
              Cancel
            </Button>
          </FlexItem>
        </Flex>
      </StackItem>
    </>
  )
}
