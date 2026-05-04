import { Form } from '@patternfly/react-core'
import type { FormEvent, ReactNode } from 'react'

type NodeFormContainerProps = {
  children: ReactNode
  formId: string
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

/**
 * Shared container for node forms to enable full-height scrolling layout.
 */
export function NodeFormContainer({ children, formId, onSubmit }: NodeFormContainerProps) {
  return (
    <Form
      id={formId}
      data-testid={formId}
      onSubmit={onSubmit}
      style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}
    >
      {children}
    </Form>
  )
}
