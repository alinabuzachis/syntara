import { TriggerTypeEnum } from '@ansible/nexus-contracts'
import {
  Alert,
  ClipboardCopy,
  ClipboardCopyVariant,
  Content,
  ContentVariants,
  Divider,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  List,
  ListItem,
  Stack,
  StackItem,
  TextInput,
} from '@patternfly/react-core'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef } from 'react'
import { Controller, FormProvider, useForm, useFormContext, useWatch } from 'react-hook-form'

import { FormLabelWithHelp } from '../../../components/FormLabelWithHelp'
import { DateRangeCadencePicker } from '../../../components/forms/DateRangeCadencePicker'
import { WEBHOOK_BASE_URL } from '../../../utils/backendUrl'
import { ExpandableCodeEditor, type ExpandableCodeEditorHandle } from '../components/ExpandableCodeEditor'
import { JsonEditorControls } from '../components/JsonEditorToolbar'

import { ActivityNameField } from './shared/ActivityNameField'
import { zodResolver } from './shared/formSchemaUtils'
import { NodeFormContainer } from './shared/NodeFormContainer'
import { NodeFormTabsLayout } from './shared/NodeFormTabsLayout'
import { normalizeWebhookPath, triggerFormSchema, type TriggerFormData } from './triggerFormSchema'

export type { TriggerFormData }

const EXAMPLE_INPUT_SCHEMA = JSON.stringify(
  {
    type: 'object',
    properties: {
      name: { type: 'string' },
    },
    required: ['name'],
  },
  null,
  2
)

// Default pass-through JSON schema placeholder
const DEFAULT_JSON_SCHEMA = `{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {},
  "additionalProperties": true
}`

const EXAMPLE_JSON_SCHEMA = JSON.stringify(
  {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: {
      event: { type: 'string' },
      payload: { type: 'object' },
    },
    required: ['event'],
    additionalProperties: false,
  },
  null,
  2
)

// ---------------------------------------------------------------------------
// Help text components
// ---------------------------------------------------------------------------

function WebhookPathHelp() {
  return (
    <FormLabelWithHelp
      label="Webhook path"
      helpText='Enter a unique name or "slug" to identify this endpoint (e.g., jira-updates). This path helps you identify the trigger in your workflow and will be part of the final generated URL.'
    />
  )
}

function HttpMethodHelp() {
  return (
    <FormLabelWithHelp
      label="HTTP method"
      helpText={
        <Stack hasGutter>
          <StackItem>The HTTP method specifies the type of request this webhook will accept.</StackItem>
          <StackItem>
            <List>
              <ListItem>
                <strong>POST (Fixed)</strong>: To ensure consistent and secure data handling, this trigger is restricted
                to the POST method.
              </ListItem>
              <ListItem>
                <strong>Standardization</strong>: POST is the industry standard for webhooks as it allows for large data
                payloads to be transmitted securely in the request body.
              </ListItem>
              <ListItem>
                <strong>Incompatibility</strong>: If your external system attempts to call this URL using a different
                method (such as GET or PUT), it will receive a 405 Method Not Allowed error.
              </ListItem>
            </List>
          </StackItem>
        </Stack>
      }
    />
  )
}

function UrlHelp() {
  return (
    <FormLabelWithHelp
      label="URL"
      helpText="This is the unique URL for this trigger. Provide this to your external service (e.g., GitHub, Slack, or a custom app). Use the copy button to capture the full URL."
    />
  )
}

function JsonSchemaHelp() {
  return (
    <FormLabelWithHelp
      label="JSON schema validation"
      helpText={
        <Stack hasGutter>
          <StackItem>
            Define a structure that all incoming POST requests must follow. This acts as a security and quality gate for
            your workflow.
          </StackItem>
          <StackItem>
            <List>
              <ListItem>
                <strong>Enforcement</strong>: If incoming data does not match the schema, the trigger will reject the
                request with a 400 Bad Request error and the workflow will not run.
              </ListItem>
              <ListItem>
                <strong>Default behavior</strong>: The placeholder schema is a &quot;pass-through&quot; that allows all
                data. Edit the properties block to enforce specific fields.
              </ListItem>
            </List>
          </StackItem>
        </Stack>
      }
    />
  )
}

// ---------------------------------------------------------------------------
// Connection instructions
// ---------------------------------------------------------------------------

function WebhookConnectionInstructions() {
  return (
    <Alert variant="info" isInline isPlain isExpandable title="Webhook Connection Instructions" component="h4">
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
// Manual trigger form fields
// ---------------------------------------------------------------------------

function ManualTriggerFields({ errors }: { errors: { inputSchema?: { message?: string } } }) {
  const { control } = useFormContext<TriggerFormData>()
  const inputSchemaEditorRef = useRef<ExpandableCodeEditorHandle | null>(null)

  const inputSchemaError = errors.inputSchema?.message

  useEffect(() => {
    if (inputSchemaError && inputSchemaEditorRef.current) inputSchemaEditorRef.current.focus()
  }, [inputSchemaError])

  return (
    <StackItem>
      <FormGroup label="Input schema" fieldId="trigger-input-schema">
        <Controller
          control={control}
          name="inputSchema"
          render={({ field }) => (
            <ExpandableCodeEditor
              ref={inputSchemaEditorRef}
              code={field.value ?? ''}
              onCodeChange={field.onChange}
              onBlur={field.onBlur}
              language="json"
              height="150px"
              modalTitle="Edit input schema"
              ariaLabel="Input schema editor"
              additionalControls={
                <JsonEditorControls
                  code={field.value ?? ''}
                  onCodeChange={field.onChange}
                  defaultCode={''}
                  downloadFilename="input-schema.json"
                  exampleCode={EXAMPLE_INPUT_SCHEMA}
                />
              }
            />
          )}
        />
        <FormHelperText>
          <HelperText>
            <HelperTextItem variant={inputSchemaError ? 'error' : 'default'}>
              {inputSchemaError ?? 'Optional JSON Schema defining the input data required to run this workflow.'}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>
    </StackItem>
  )
}

// ---------------------------------------------------------------------------
// Webhook form fields
// ---------------------------------------------------------------------------

function WebhookFields({
  errors,
}: {
  errors: { webhookPath?: { message?: string }; inputSchema?: { message?: string } }
}) {
  const { control } = useFormContext<TriggerFormData>()
  const webhookPath = useWatch({ control, name: 'webhookPath' })
  const inputSchemaEditorRef = useRef<ExpandableCodeEditorHandle | null>(null)

  const cleanPath = normalizeWebhookPath(webhookPath ?? '')
  const fullWebhookUrl = cleanPath ? `${WEBHOOK_BASE_URL}/${cleanPath}` : WEBHOOK_BASE_URL

  const webhookPathError = errors.webhookPath?.message
  const inputSchemaError = errors.inputSchema?.message

  useEffect(() => {
    if (inputSchemaError && inputSchemaEditorRef.current) inputSchemaEditorRef.current.focus()
  }, [inputSchemaError])

  return (
    <>
      <StackItem>
        <WebhookConnectionInstructions />
      </StackItem>

      <StackItem>
        <FormGroup label={<HttpMethodHelp />} fieldId="http-method">
          <TextInput id="http-method" aria-label="HTTP method" value="POST" isDisabled />
        </FormGroup>
      </StackItem>

      <StackItem>
        <FormGroup label={<UrlHelp />} fieldId="webhook-url">
          <ClipboardCopy isReadOnly variant={ClipboardCopyVariant.expansion} aria-label="Webhook URL">
            {fullWebhookUrl}
          </ClipboardCopy>
        </FormGroup>
      </StackItem>

      <StackItem>
        <Divider />
      </StackItem>

      <StackItem>
        <FormGroup label={<WebhookPathHelp />} fieldId="webhook-path" isRequired>
          <Controller
            control={control}
            name="webhookPath"
            render={({ field }) => (
              <TextInput
                id="webhook-path"
                aria-label="Webhook path"
                placeholder="/jira-updates"
                validated={webhookPathError ? 'error' : 'default'}
                value={field.value ?? ''}
                onChange={(_event, value) => field.onChange(value)}
                onBlur={field.onBlur}
              />
            )}
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant={webhookPathError ? 'error' : 'default'}>
                {webhookPathError ?? 'A unique slug for this endpoint (e.g., jira-updates).'}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </StackItem>

      <StackItem>
        <FormGroup label={<JsonSchemaHelp />} fieldId="json-schema">
          <Controller
            control={control}
            name="inputSchema"
            render={({ field }) => (
              <ExpandableCodeEditor
                ref={inputSchemaEditorRef}
                code={field.value || DEFAULT_JSON_SCHEMA}
                onCodeChange={field.onChange}
                onBlur={field.onBlur}
                language="json"
                height="150px"
                modalTitle="Edit JSON schema"
                ariaLabel="JSON schema validation editor"
                additionalControls={
                  <JsonEditorControls
                    code={field.value || DEFAULT_JSON_SCHEMA}
                    onCodeChange={field.onChange}
                    defaultCode={DEFAULT_JSON_SCHEMA}
                    downloadFilename="json-schema.json"
                    exampleCode={EXAMPLE_JSON_SCHEMA}
                  />
                }
              />
            )}
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant={inputSchemaError ? 'error' : 'default'}>
                {inputSchemaError ?? 'Optional JSON Schema for validating incoming webhook payloads.'}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </StackItem>
    </>
  )
}

// ---------------------------------------------------------------------------
// Main form fields orchestrator
// ---------------------------------------------------------------------------

type TriggerNodeFormProps = {
  onSubmit: (data: TriggerFormData) => void
  initialData?: Partial<TriggerFormData>
  onHeaderContentChange?: (content: ReactNode | null) => void
}

function TriggerFormFields({
  onHeaderContentChange,
  validationErrors,
}: {
  onHeaderContentChange?: (content: ReactNode | null) => void
  validationErrors?: {
    interval?: { message?: string }
    inputSchema?: { message?: string }
    webhookPath?: { message?: string }
  }
}) {
  const {
    control,
    register,
    formState: { errors: contextErrors },
  } = useFormContext<TriggerFormData>()
  const errors = validationErrors ?? contextErrors
  const triggerType = useWatch({ control, name: 'triggerType' })
  const scheduleType = useWatch({ control, name: 'scheduleType' })

  useEffect(() => {
    if (errors.interval) document.getElementById('cadence-start')?.focus()
  }, [errors.interval])

  const nameField = useMemo(
    () => (
      <ActivityNameField<TriggerFormData>
        register={register}
        fieldId="trigger-name"
        placeholder="Enter trigger name"
        ariaLabel="Name"
      />
    ),
    [register]
  )

  useEffect(() => {
    onHeaderContentChange?.(nameField)
    return () => {
      onHeaderContentChange?.(null)
    }
  }, [nameField, onHeaderContentChange])

  const parametersContent = (
    <Stack hasGutter>
      <input type="hidden" {...register('triggerType')} />

      {triggerType === TriggerTypeEnum.MANUAL_TRIGGER && <ManualTriggerFields errors={errors} />}

      {triggerType === TriggerTypeEnum.SCHEDULED && (
        <>
          <StackItem>
            <FormGroup label="Schedule type" fieldId="schedule-type">
              <Controller
                control={control}
                name="scheduleType"
                render={({ field }) => (
                  <FormSelect
                    id="schedule-type"
                    aria-label="Schedule type"
                    value={field.value}
                    onChange={(_event, value) => field.onChange(value)}
                  >
                    <FormSelectOption value="interval" label="Interval" />
                    <FormSelectOption value="continuous" label="Continuous" />
                  </FormSelect>
                )}
              />
            </FormGroup>
          </StackItem>

          {scheduleType === 'interval' && (
            <StackItem>
              <Controller
                control={control}
                name="interval"
                render={({ field }) => (
                  <DateRangeCadencePicker
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    required
                    showTime
                    error={!!errors.interval}
                    errorMessage={errors.interval?.message}
                  />
                )}
              />
            </StackItem>
          )}
        </>
      )}

      {triggerType === TriggerTypeEnum.WEBHOOK_TRIGGER && <WebhookFields errors={errors} />}
    </Stack>
  )

  return <NodeFormTabsLayout parametersContent={parametersContent} />
}

export function TriggerNodeForm(props: TriggerNodeFormProps) {
  const defaultValues: TriggerFormData = {
    name: '',
    triggerType: props.initialData?.triggerType ?? 'manual',
    scheduleType: 'interval',
    interval: '',
    inputSchema: '',
    webhookPath: '',
    ...props.initialData,
  }

  const methods = useForm<TriggerFormData>({
    resolver: zodResolver(triggerFormSchema, undefined, { mode: 'sync' }),
    defaultValues,
  })

  const {
    formState: { errors },
  } = methods

  const handleSubmit = (data: TriggerFormData) => {
    const isManual = data.triggerType === TriggerTypeEnum.MANUAL_TRIGGER
    const isScheduled = data.triggerType === TriggerTypeEnum.SCHEDULED
    const isWebhook = data.triggerType === TriggerTypeEnum.WEBHOOK_TRIGGER

    const cleanedData: TriggerFormData = {
      name: data.name,
      triggerType: data.triggerType,
      inputSchema: isManual || isWebhook ? data.inputSchema : undefined,
      scheduleType: isScheduled ? data.scheduleType : undefined,
      interval: isScheduled && data.scheduleType === 'interval' ? data.interval : undefined,
      webhookPath: isWebhook ? normalizeWebhookPath(data.webhookPath ?? '') : undefined,
    }
    props.onSubmit(cleanedData)
  }

  return (
    <FormProvider {...methods}>
      <NodeFormContainer formId="trigger-node-form" onSubmit={methods.handleSubmit(handleSubmit)}>
        <TriggerFormFields onHeaderContentChange={props.onHeaderContentChange} validationErrors={errors} />
      </NodeFormContainer>
    </FormProvider>
  )
}
