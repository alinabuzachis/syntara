import { ClipboardCopy, Divider, FormGroup, StackItem, TextInput } from '@patternfly/react-core'
import type { ReactNode } from 'react'

type WebhookUrlPreviewProps = {
  /** Full webhook URL to display in the ClipboardCopy field. */
  url: string
  /** Label element for the HTTP method field. */
  httpMethodLabel: ReactNode
  /** Label element for the URL field. */
  urlLabel: ReactNode
  /** DOM id prefix for the FormGroup and input elements (defaults to "webhook"). */
  fieldIdPrefix?: string
}

/**
 * Shared HTTP method (disabled POST) + URL preview (ClipboardCopy) + divider,
 * used by both webhook and EDA trigger forms.
 */
export function WebhookUrlPreview({
  url,
  httpMethodLabel,
  urlLabel,
  fieldIdPrefix = 'webhook',
}: Readonly<WebhookUrlPreviewProps>) {
  return (
    <>
      <StackItem>
        <FormGroup label={httpMethodLabel} fieldId={`${fieldIdPrefix}-http-method`}>
          <TextInput id={`${fieldIdPrefix}-http-method`} aria-label="HTTP method" value="POST" isDisabled />
        </FormGroup>
      </StackItem>

      <StackItem>
        <FormGroup label={urlLabel} fieldId={`${fieldIdPrefix}-url`}>
          <ClipboardCopy isReadOnly aria-label="Webhook URL">
            {url}
          </ClipboardCopy>
        </FormGroup>
      </StackItem>

      <StackItem>
        <Divider />
      </StackItem>
    </>
  )
}
