import {
  Form,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Stack,
  StackItem,
  TextArea,
  TextInput,
} from '@patternfly/react-core'
import { RhUiErrorIcon } from '@patternfly/react-icons'
import { Controller, FormProvider, useForm, useFormContext, useWatch } from 'react-hook-form'

import { FormSubmitButton } from './shared/FormSubmitButton'

// Type definitions (Priority 2)
export type ExecutorType = 'script' | 'api'
export type ScriptLanguage = 'python' | 'bash'
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface ActionFormData {
  name: string
  executor: ExecutorType
  language?: ScriptLanguage
  code?: string
  method?: HttpMethod
  url?: string
  authentication?: string
  headers?: string
  body?: string
  parameters?: string
}

interface ActionNodeFormProps {
  onSubmit: (data: ActionFormData) => void
  onCancel: () => void
  submitButtonText?: string
  initialData?: Partial<ActionFormData>
}

// Constants (Priority 4)
const EXECUTOR_OPTIONS: Array<{ label: string; value: ExecutorType }> = [
  { label: 'Script', value: 'script' },
  { label: 'REST Api', value: 'api' },
]

const SCRIPT_LANGUAGE_OPTIONS: Array<{ label: string; value: ScriptLanguage }> = [
  { label: 'Python', value: 'python' },
  { label: 'Bash', value: 'bash' },
]

const HTTP_METHOD_OPTIONS: Array<{ label: HttpMethod; value: HttpMethod }> = [
  { label: 'GET', value: 'GET' },
  { label: 'POST', value: 'POST' },
  { label: 'PUT', value: 'PUT' },
  { label: 'PATCH', value: 'PATCH' },
  { label: 'DELETE', value: 'DELETE' },
]

/**
 * Form fields component that manually registers fields with react-hook-form
 */
function ActionFormFields({ submitButtonText }: { submitButtonText?: string }) {
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<ActionFormData>()
  const executor = useWatch({ control, name: 'executor' })

  return (
    <Stack
      hasGutter
      style={{
        paddingLeft: 'var(--pf-t--global--spacer--xs)',
        paddingRight: 'var(--pf-t--global--spacer--xs)',
      }}
    >
      <StackItem>
        <FormGroup label="Action Type" fieldId="action-executor">
          <Controller
            control={control}
            name="executor"
            render={({ field }) => (
              <FormSelect
                id="action-executor"
                aria-label="Action Type"
                value={field.value}
                onChange={(_event, value) => field.onChange(value)}
              >
                {EXECUTOR_OPTIONS.map((option) => (
                  <FormSelectOption key={option.value} value={option.value} label={option.label} />
                ))}
              </FormSelect>
            )}
          />
        </FormGroup>
      </StackItem>

      <StackItem>
        <FormGroup label="Name" isRequired fieldId="action-name">
          <TextInput
            {...register('name', { required: 'Name is required' })}
            id="action-name"
            placeholder="Enter activity name"
            type="text"
          />
          {errors.name && (
            <FormHelperText>
              <HelperText>
                <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                  {errors.name.message}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          )}
        </FormGroup>
      </StackItem>

      {executor === 'script' && (
        <>
          <StackItem>
            <FormGroup label="Language" fieldId="action-language">
              <Controller
                control={control}
                name="language"
                render={({ field }) => (
                  <FormSelect
                    id="action-language"
                    aria-label="Language"
                    value={field.value}
                    onChange={(_event, value) => field.onChange(value)}
                  >
                    {SCRIPT_LANGUAGE_OPTIONS.map((option) => (
                      <FormSelectOption key={option.value} value={option.value} label={option.label} />
                    ))}
                  </FormSelect>
                )}
              />
            </FormGroup>
          </StackItem>
          <StackItem>
            <FormGroup label="Code" isRequired fieldId="action-code">
              <TextArea
                {...register('code', { required: 'Code is required' })}
                id="action-code"
                placeholder="Enter your code..."
                rows={5}
              />
              {errors.code && (
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                      {errors.code.message}
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              )}
            </FormGroup>
          </StackItem>
          <StackItem>
            <FormGroup label="Input parameters" fieldId="action-parameters">
              <TextArea {...register('parameters')} id="action-parameters" placeholder='{"key": "value"}' rows={3} />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>Define inputs for this task</HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>
          </StackItem>
        </>
      )}

      {executor === 'api' && (
        <>
          <StackItem>
            <FormGroup label="URL" isRequired fieldId="action-url">
              <TextInput
                {...register('url', { required: 'URL is required' })}
                id="action-url"
                type="url"
                placeholder="https://api.example.com/endpoint"
              />
              {errors.url && (
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                      {errors.url.message}
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              )}
            </FormGroup>
          </StackItem>
          <StackItem>
            <FormGroup label="HTTP Method" fieldId="action-method">
              <Controller
                control={control}
                name="method"
                render={({ field }) => (
                  <FormSelect
                    id="action-method"
                    aria-label="HTTP Method"
                    value={field.value}
                    onChange={(_event, value) => field.onChange(value)}
                  >
                    {HTTP_METHOD_OPTIONS.map((option) => (
                      <FormSelectOption key={option.value} value={option.value} label={option.label} />
                    ))}
                  </FormSelect>
                )}
              />
            </FormGroup>
          </StackItem>
          <StackItem>
            <FormGroup label="Authentication" fieldId="action-authentication">
              <TextInput
                {...register('authentication')}
                id="action-authentication"
                placeholder="Bearer token or API key"
                type="text"
              />
            </FormGroup>
          </StackItem>
          <StackItem>
            <FormGroup label="Headers" fieldId="action-headers">
              <TextArea
                {...register('headers')}
                id="action-headers"
                placeholder='{"Content-Type": "application/json"}'
                rows={2}
              />
            </FormGroup>
          </StackItem>
          <StackItem>
            <FormGroup label="Body" fieldId="action-body">
              <TextArea {...register('body')} id="action-body" placeholder='{"key": "value"}' rows={3} />
            </FormGroup>
          </StackItem>
        </>
      )}

      <FormSubmitButton submitButtonText={submitButtonText} />
    </Stack>
  )
}

export function ActionNodeForm(props: ActionNodeFormProps) {
  const defaultValues: ActionFormData = {
    name: '',
    executor: 'script',
    language: 'python',
    method: 'GET',
    ...props.initialData,
  }

  const handleSubmit = (data: ActionFormData) => {
    // Clean up data based on executor type
    const cleanedData: ActionFormData = {
      name: data.name,
      executor: data.executor,
      language: data.executor === 'script' ? data.language : undefined,
      code: data.executor === 'script' ? data.code : undefined,
      method: data.executor === 'api' ? data.method : undefined,
      url: data.executor === 'api' ? data.url : undefined,
      authentication: data.executor === 'api' && data.authentication ? data.authentication : undefined,
      headers: data.executor === 'api' ? data.headers : undefined,
      body: data.executor === 'api' ? data.body : undefined,
      parameters: data.parameters || undefined,
    }
    props.onSubmit(cleanedData)
  }

  const methods = useForm<ActionFormData>({
    defaultValues,
  })

  return (
    <FormProvider {...methods}>
      <Form id="action-node-form" onSubmit={methods.handleSubmit(handleSubmit)}>
        <ActionFormFields submitButtonText={props.submitButtonText} />
      </Form>
    </FormProvider>
  )
}
