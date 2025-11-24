import {
  Button,
  Card,
  Checkbox,
  Controller,
  Form,
  Input,
  NativeSelect,
  Textarea,
  useFormContext,
  useWatch,
} from '@ansible/nexus-ui-framework'

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
  requiresApproval?: boolean
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
  { label: 'API Call', value: 'api' },
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
  const { register, control } = useFormContext<ActionFormData>()
  const executor = useWatch({ name: 'executor' })

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="action-executor" className="text-xs font-medium text-gray-300">
          Action Type
        </label>
        <NativeSelect {...register('executor')} id="action-executor">
          {EXECUTOR_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="action-name" className="text-xs font-medium text-gray-300">
          Name <span className="text-red-500">*</span>
        </label>
        <Input
          {...register('name', { required: true })}
          id="action-name"
          placeholder="Enter activity name"
          className="text-xs"
        />
      </div>

      {executor === 'script' && (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="action-language" className="text-xs font-medium text-gray-300">
              Language
            </label>
            <NativeSelect {...register('language')} id="action-language">
              {SCRIPT_LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="action-code" className="text-xs font-medium text-gray-300">
              Code <span className="text-red-500">*</span>
            </label>
            <Textarea
              {...register('code', { required: true })}
              id="action-code"
              placeholder="Enter your code..."
              rows={5}
              className="text-xs"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="action-parameters" className="text-xs font-medium text-gray-300">
              Input parameters
            </label>
            <Textarea
              {...register('parameters')}
              id="action-parameters"
              placeholder='{"key": "value"}'
              rows={3}
              className="text-xs"
            />
            <p className="text-xs text-gray-400">Optional: Define inputs for this task</p>
          </div>
        </>
      )}

      {executor === 'api' && (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="action-url" className="text-xs font-medium text-gray-300">
              URL <span className="text-red-500">*</span>
            </label>
            <Input
              {...register('url', { required: true })}
              id="action-url"
              type="url"
              placeholder="https://api.example.com/endpoint"
              className="text-xs"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="action-method" className="text-xs font-medium text-gray-300">
              HTTP Method
            </label>
            <NativeSelect {...register('method')} id="action-method">
              {HTTP_METHOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="action-authentication" className="text-xs font-medium text-gray-300">
              Authentication
            </label>
            <Input
              {...register('authentication')}
              id="action-authentication"
              placeholder="Bearer token or API key"
              className="text-xs"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="action-headers" className="text-xs font-medium text-gray-300">
              Headers
            </label>
            <Textarea
              {...register('headers')}
              id="action-headers"
              placeholder='{"Content-Type": "application/json"}'
              rows={2}
              className="text-xs"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="action-body" className="text-xs font-medium text-gray-300">
              Body
            </label>
            <Textarea
              {...register('body')}
              id="action-body"
              placeholder='{"key": "value"}'
              rows={3}
              className="text-xs"
            />
          </div>
        </>
      )}

      <Controller
        control={control}
        name="requiresApproval"
        render={({ field }) => (
          <Checkbox checked={field.value} onCheckedChange={field.onChange} label="Require approval" />
        )}
      />

      <Button type="submit" variant="primary" className="w-full justify-center text-xs">
        {submitButtonText ?? 'Add node'}
      </Button>
    </>
  )
}

export function ActionNodeForm(props: ActionNodeFormProps) {
  const defaultValues: ActionFormData = {
    name: '',
    executor: 'script',
    language: 'python',
    method: 'GET',
    requiresApproval: false,
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
      requiresApproval: data.requiresApproval || undefined,
    }
    props.onSubmit(cleanedData)
  }

  return (
    <Card variant="glass" padding="md" className="flex flex-col gap-3">
      <Form<ActionFormData>
        id="action-node-form"
        defaultValues={defaultValues}
        onSubmit={handleSubmit}
        className="flex flex-col gap-3"
      >
        {() => <ActionFormFields submitButtonText={props.submitButtonText} />}
      </Form>
    </Card>
  )
}
