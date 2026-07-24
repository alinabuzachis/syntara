import { Alert, Content, ContentVariants, FormGroup, List, ListItem, StackItem } from '@patternfly/react-core'
import { Controller, useFormContext } from 'react-hook-form'

import { FieldHelpPopover } from '../../../components/FieldHelpPopover'
import { FormLabelWithHelp } from '../../../components/FormLabelWithHelp'
import { WEBHOOK_BASE_URL } from '../../../utils/backendUrl'

import { JsonSchemaField } from './JsonSchemaField'
import { ServiceAccountSelect } from './ServiceAccountSelect'
import { nodeHelp } from './shared/nodeFieldHelp'
import type { TriggerFormData } from './triggerFormSchema'
import { DEFAULT_JSON_SCHEMA, EXAMPLE_JSON_SCHEMA, JSON_SCHEMA_DOWNLOAD_FILENAME } from './triggerFormSchema'
import { useWebhookUrl } from './useWebhookUrl'
import { WebhookPathField } from './WebhookPathField'
import { WebhookUrlPreview } from './WebhookUrlPreview'

const EDA_WEBHOOK_BASE_URL = `${WEBHOOK_BASE_URL}/eda`

const EDA_WEBHOOK_PATH_HELP =
  'Enter a unique name or "slug" to identify this endpoint (e.g., /eda-events). This path helps you identify the trigger in your workflow and will be part of the final generated URL.'

const edaWebhookPathLabelHelp = <FieldHelpPopover headerContent="Webhook path" helpText={EDA_WEBHOOK_PATH_HELP} />

// ---------------------------------------------------------------------------
// Connection instructions
// ---------------------------------------------------------------------------

function EdaConnectionInstructions() {
  return (
    <Alert variant="info" isInline isExpandable title="Event-Driven Ansible Connection Instructions" component="h4">
      <Content component={ContentVariants.p} style={{ marginBottom: 'var(--pf-t--global--spacer--sm)' }}>
        To successfully trigger this workflow from Event-Driven Ansible, follow these steps:
      </Content>
      <List component="ol">
        <ListItem>
          <strong>Set a webhook path</strong>: Enter a path in the field below to create your unique endpoint.
        </ListItem>
        <ListItem>
          <strong>Copy the webhook URL</strong>: Locate the URL field and click the copy icon to save the unique
          endpoint to your clipboard.
        </ListItem>
        <ListItem>
          <strong>Configure your EDA rulebook</strong>:
          <List>
            <ListItem>
              <strong>Destination URL</strong>: Paste the copied URL into the appropriate section of your Event-Driven
              Ansible rulebook.
            </ListItem>
            <ListItem>
              <strong>Method</strong>: Ensure the action is set to send a POST request.
            </ListItem>
          </List>
        </ListItem>
      </List>
    </Alert>
  )
}

// ---------------------------------------------------------------------------
// EDA trigger form fields
// ---------------------------------------------------------------------------

export function EdaFields({
  errors,
}: Readonly<{
  errors: Readonly<{ webhookPath?: { message?: string }; inputSchema?: { message?: string } }>
}>) {
  const fullEdaUrl = useWebhookUrl(EDA_WEBHOOK_BASE_URL)
  const { control } = useFormContext<TriggerFormData>()

  return (
    <>
      <StackItem>
        <EdaConnectionInstructions />
      </StackItem>

      <WebhookUrlPreview
        url={fullEdaUrl}
        fieldIdPrefix="eda"
        httpMethodLabelHelp={nodeHelp.edaHttpMethod}
        urlLabelHelp={nodeHelp.edaUrl}
      />

      <WebhookPathField
        fieldId="eda-webhook-path"
        label="Webhook path"
        labelHelp={edaWebhookPathLabelHelp}
        placeholder="/eda-events"
        helperText="A unique slug for this endpoint (e.g., /eda-events)."
        error={errors.webhookPath?.message}
      />

      <StackItem>
        <FormGroup
          label={
            <FormLabelWithHelp
              label="Authorized service accounts"
              helpText="Select the service accounts that are allowed to invoke this EDA trigger endpoint. Callers must authenticate with a Bearer token from one of these service accounts."
            />
          }
          fieldId="eda-authorized-service-accounts"
        >
          <Controller
            control={control}
            name="authorizedServiceAccountIds"
            render={({ field }) => (
              <ServiceAccountSelect
                id="eda-authorized-service-accounts"
                selectedIds={field.value ?? []}
                onChange={field.onChange}
              />
            )}
          />
        </FormGroup>
      </StackItem>

      <JsonSchemaField
        fieldId="eda-json-schema"
        label="JSON schema validation"
        labelHelp={nodeHelp.edaInputSchema}
        defaultCode={DEFAULT_JSON_SCHEMA}
        exampleCode={EXAMPLE_JSON_SCHEMA}
        modalTitle="Edit JSON schema"
        ariaLabel="JSON schema validation editor"
        downloadFilename={JSON_SCHEMA_DOWNLOAD_FILENAME}
        helperText="Optional JSON Schema for validating incoming EDA event payloads."
        error={errors.inputSchema?.message}
      />
    </>
  )
}
