import {
  ClipboardCopy,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Divider,
  FormGroup,
  StackItem,
} from '@patternfly/react-core'
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
 * Shared HTTP method (read-only POST) + URL preview (ClipboardCopy) + divider,
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
        <DescriptionList isCompact>
          <DescriptionListGroup>
            <DescriptionListTerm>{httpMethodLabel}</DescriptionListTerm>
            <DescriptionListDescription>POST</DescriptionListDescription>
          </DescriptionListGroup>
        </DescriptionList>
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
