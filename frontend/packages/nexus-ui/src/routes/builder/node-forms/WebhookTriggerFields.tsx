import { Alert, Content, ContentVariants, FormGroup, List, ListItem, Stack, StackItem } from '@patternfly/react-core'
import { Controller, useFormContext } from 'react-hook-form'

import { FieldHelpPopover } from '../../../components/FieldHelpPopover'
import { FormLabelWithHelp } from '../../../components/FormLabelWithHelp'
import { WEBHOOK_BASE_URL } from '../../../utils/backendUrl'

import { JsonSchemaField } from './JsonSchemaField'
import { ServiceAccountSelect } from './ServiceAccountSelect'
import type { TriggerFormData } from './triggerFormSchema'
import { DEFAULT_JSON_SCHEMA, EXAMPLE_JSON_SCHEMA, JSON_SCHEMA_DOWNLOAD_FILENAME } from './triggerFormSchema'
import { useWebhookUrl } from './useWebhookUrl'
import { WebhookPathField } from './WebhookPathField'
import { WebhookUrlPreview } from './WebhookUrlPreview'

const WEBHOOK_HTTP_METHOD_HELP = (
  <Stack hasGutter>
    <StackItem>The HTTP method specifies the type of request this webhook will accept.</StackItem>
    <StackItem>
      <List>
        <ListItem>
          <strong>POST (Fixed)</strong>: To ensure consistent and secure data handling, this trigger is restricted to
          the POST method.
        </ListItem>
        <ListItem>
          <strong>Standardization</strong>: POST is the industry standard for webhooks as it allows for large data
          payloads to be transmitted securely in the request body.
        </ListItem>
        <ListItem>
          <strong>Incompatibility</strong>: If your external system attempts to call this URL using a different method
          (such as GET or PUT), it will receive a 405 Method Not Allowed error.
        </ListItem>
      </List>
    </StackItem>
  </Stack>
)

const WEBHOOK_URL_HELP =
  'This is the unique URL for this trigger. Provide this to your external service (e.g., GitHub, Slack, or a custom app). Use the copy button to capture the full URL.'

const WEBHOOK_PATH_HELP =
  'Enter a unique name or "slug" to identify this endpoint (e.g., /jira-updates). This path helps you identify the trigger in your workflow and will be part of the final generated URL.'

const WEBHOOK_JSON_SCHEMA_HELP = (
  <Stack hasGutter>
    <StackItem>
      Define a structure that all incoming POST requests must follow. This acts as a security and quality gate for your
      workflow.
    </StackItem>
    <StackItem>
      <List>
        <ListItem>
          <strong>Enforcement</strong>: If incoming data does not match the schema, the trigger will reject the request
          with a 400 Bad Request error and the workflow will not run.
        </ListItem>
        <ListItem>
          <strong>Default behavior</strong>: The placeholder schema is a &quot;pass-through&quot; that allows all data.
          Edit the properties block to enforce specific fields.
        </ListItem>
      </List>
    </StackItem>
  </Stack>
)

const webhookHttpMethodLabelHelp = <FieldHelpPopover headerContent="HTTP method" helpText={WEBHOOK_HTTP_METHOD_HELP} />
const webhookUrlLabelHelp = <FieldHelpPopover headerContent="URL" helpText={WEBHOOK_URL_HELP} />
const webhookPathLabelHelp = <FieldHelpPopover headerContent="Webhook path" helpText={WEBHOOK_PATH_HELP} />
const webhookJsonSchemaLabelHelp = (
  <FieldHelpPopover headerContent="JSON schema validation" helpText={WEBHOOK_JSON_SCHEMA_HELP} />
)

// ---------------------------------------------------------------------------
// Connection instructions
// ---------------------------------------------------------------------------

function WebhookConnectionInstructions() {
  return (
    <Alert variant="info" isInline isExpandable title="Webhook Connection Instructions" component="h4">
      <Content component={ContentVariants.p} style={{ marginBottom: 'var(--pf-t--global--spacer--sm)' }}>
        To successfully trigger this workflow from an external application (such as GitHub, Jira, or a custom service),
        follow these steps:
      </Content>
      <List component="ol">
        <ListItem>
          <strong>Set a webhook path</strong>: Enter a path in the field above to create your unique endpoint.
        </ListItem>
        <ListItem>
          <strong>Copy the webhook URL</strong>: Locate the URL field below and click the copy icon to save the unique
          endpoint to your clipboard.
        </ListItem>
        <ListItem>
          <strong>Configure your external system</strong>:
          <List>
            <ListItem>
              <strong>Destination URL</strong>: Paste the copied URL into the webhook or listener settings of your
              external application.
            </ListItem>
            <ListItem>
              <strong>Method</strong>: Ensure the external application is set to send a POST request.
            </ListItem>
          </List>
        </ListItem>
      </List>
    </Alert>
  )
}

// ---------------------------------------------------------------------------
// Webhook form fields
// ---------------------------------------------------------------------------

export function WebhookFields({
  errors,
}: Readonly<{
  errors: Readonly<{ webhookPath?: { message?: string }; inputSchema?: { message?: string } }>
}>) {
  const fullWebhookUrl = useWebhookUrl(WEBHOOK_BASE_URL)
  const { control } = useFormContext<TriggerFormData>()

  return (
    <>
      <StackItem>
        <WebhookConnectionInstructions />
      </StackItem>

      <WebhookUrlPreview
        url={fullWebhookUrl}
        httpMethodLabelHelp={webhookHttpMethodLabelHelp}
        urlLabelHelp={webhookUrlLabelHelp}
      />

      <WebhookPathField
        label="Webhook path"
        labelHelp={webhookPathLabelHelp}
        placeholder="/jira-updates"
        helperText="A unique slug for this endpoint (e.g., /jira-updates)."
        error={errors.webhookPath?.message}
      />

      <StackItem>
        <FormGroup
          label={
            <FormLabelWithHelp
              label="Authorized service accounts"
              helpText="Select the service accounts that are allowed to invoke this webhook trigger endpoint. Callers must authenticate with a Bearer token from one of these service accounts."
            />
          }
          fieldId="webhook-authorized-service-accounts"
        >
          <Controller
            control={control}
            name="authorizedServiceAccountIds"
            render={({ field }) => (
              <ServiceAccountSelect
                id="webhook-authorized-service-accounts"
                selectedIds={field.value ?? []}
                onChange={field.onChange}
              />
            )}
          />
        </FormGroup>
      </StackItem>

      <JsonSchemaField
        label="JSON schema validation"
        labelHelp={webhookJsonSchemaLabelHelp}
        defaultCode={DEFAULT_JSON_SCHEMA}
        exampleCode={EXAMPLE_JSON_SCHEMA}
        modalTitle="Edit JSON schema"
        ariaLabel="JSON schema validation editor"
        downloadFilename={JSON_SCHEMA_DOWNLOAD_FILENAME}
        helperText="Optional JSON Schema for validating incoming webhook payloads."
        error={errors.inputSchema?.message}
      />
    </>
  )
}
