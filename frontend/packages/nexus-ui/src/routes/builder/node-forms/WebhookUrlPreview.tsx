import {
  ClipboardCopy,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Divider,
  Flex,
  FlexItem,
  FormGroup,
  StackItem,
} from '@patternfly/react-core'
import type { ReactElement, ReactNode } from 'react'

type WebhookUrlPreviewProps = {
  /** Full webhook URL to display in the ClipboardCopy field. */
  url: string
  /** Optional label help shown adjacent to the HTTP method term. */
  httpMethodLabelHelp?: ReactNode
  /** Label for the URL field (defaults to "URL"). */
  urlLabel?: string
  /** Optional label help for the URL field. */
  urlLabelHelp?: ReactElement
  /** DOM id prefix for the FormGroup and input elements (defaults to "webhook"). */
  fieldIdPrefix?: string
}

/**
 * Shared HTTP method (read-only POST) + URL preview (ClipboardCopy) + divider,
 * used by both webhook and EDA trigger forms.
 */
export function WebhookUrlPreview({
  url,
  httpMethodLabelHelp,
  urlLabel = 'URL',
  urlLabelHelp,
  fieldIdPrefix = 'webhook',
}: Readonly<WebhookUrlPreviewProps>) {
  return (
    <>
      <StackItem>
        <DescriptionList isCompact>
          <DescriptionListGroup>
            <DescriptionListTerm>
              <Flex
                alignItems={{ default: 'alignItemsCenter' }}
                gap={{ default: 'gapXs' }}
                flexWrap={{ default: 'nowrap' }}
              >
                <FlexItem>HTTP method</FlexItem>
                {httpMethodLabelHelp ? <FlexItem>{httpMethodLabelHelp}</FlexItem> : null}
              </Flex>
            </DescriptionListTerm>
            <DescriptionListDescription>POST</DescriptionListDescription>
          </DescriptionListGroup>
        </DescriptionList>
      </StackItem>

      <StackItem>
        <FormGroup label={urlLabel} labelHelp={urlLabelHelp} fieldId={`${fieldIdPrefix}-url`}>
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
