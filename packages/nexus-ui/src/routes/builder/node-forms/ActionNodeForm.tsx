/* eslint-disable jsx-a11y/label-has-associated-control */
import { Button, Card, Input, Textarea, Checkbox } from '@ansible/nexus-ui-framework'
import { useState } from 'react'

interface ActionNodeFormProps {
  onSubmit: (data: {
    name: string
    executor: string
    language?: string
    code?: string
    method?: string
    url?: string
    authentication?: string
    headers?: string
    body?: string
    parameters?: string
    requiresApproval?: boolean
  }) => void
  onCancel: () => void
  submitButtonText?: string
  initialData?: {
    name?: string
    executor?: string
    language?: string
    code?: string
    method?: string
    url?: string
    authentication?: string
    headers?: string
    body?: string
    parameters?: string
    requiresApproval?: boolean
  }
}

export function ActionNodeForm(props: ActionNodeFormProps) {
  const [name, setName] = useState(props.initialData?.name ?? '')
  const [executor, setExecutor] = useState(props.initialData?.executor ?? 'script')
  const [language, setLanguage] = useState(props.initialData?.language ?? 'python')
  const [code, setCode] = useState(props.initialData?.code ?? '')
  const [method, setMethod] = useState(props.initialData?.method ?? 'GET')
  const [url, setUrl] = useState(props.initialData?.url ?? '')
  const [authentication, setAuthentication] = useState(props.initialData?.authentication ?? '')
  const [headers, setHeaders] = useState(props.initialData?.headers ?? '')
  const [body, setBody] = useState(props.initialData?.body ?? '')
  const [parameters, setParameters] = useState(props.initialData?.parameters ?? '')
  const [requiresApproval, setRequiresApproval] = useState(props.initialData?.requiresApproval ?? false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    props.onSubmit({
      name,
      executor,
      language: executor === 'script' ? language : undefined,
      code: executor === 'script' ? code : undefined,
      method: executor === 'api' ? method : undefined,
      url: executor === 'api' ? url : undefined,
      authentication: executor === 'api' && authentication ? authentication : undefined,
      headers: executor === 'api' ? headers : undefined,
      body: executor === 'api' ? body : undefined,
      parameters: parameters || undefined,
      requiresApproval: requiresApproval || undefined,
    })
  }

  return (
    <Card variant="glass" padding="md" className="flex flex-col gap-3">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-300">Action Type</label>
          <select
            value={executor}
            onChange={(e) => setExecutor(e.target.value)}
            className="rounded-md bg-white/5 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400/50 [&_option]:bg-gray-800 [&_option]:text-white"
          >
            <option value="script">Script</option>
            <option value="api">API Call</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-300">
            Name <span className="text-red-500">*</span>
          </label>
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-xs"
            placeholder="Enter activity name"
            required
          />
        </div>

        {executor === 'script' && (
          <>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-300">Language</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="rounded-md bg-white/5 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400/50 [&_option]:bg-gray-800 [&_option]:text-white"
              >
                <option value="python">Python</option>
                <option value="bash">Bash</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-300">
                Code <span className="text-red-500">*</span>
              </label>
              <Textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="text-xs"
                placeholder="Enter your code..."
                rows={5}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-300">Input parameters</label>
              <Textarea
                value={parameters}
                onChange={(e) => setParameters(e.target.value)}
                className="text-xs"
                placeholder='{"key": "value"}'
                rows={3}
              />
              <p className="text-xs text-gray-400">Optional: Define inputs for this task</p>
            </div>
          </>
        )}

        {executor === 'api' && (
          <>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-300">
                URL <span className="text-red-500">*</span>
              </label>
              <Input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="text-xs"
                placeholder="https://api.example.com/endpoint"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-300">HTTP Method</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="rounded-md bg-white/5 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400/50 [&_option]:bg-gray-800 [&_option]:text-white"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
                <option value="DELETE">DELETE</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-300">Authentication</label>
              <Input
                type="text"
                value={authentication}
                onChange={(e) => setAuthentication(e.target.value)}
                className="text-xs"
                placeholder="Bearer token or API key"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-300">Headers</label>
              <Textarea
                value={headers}
                onChange={(e) => setHeaders(e.target.value)}
                className="text-xs"
                placeholder='{"Content-Type": "application/json"}'
                rows={2}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-300">Body</label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="text-xs"
                placeholder='{"key": "value"}'
                rows={3}
              />
            </div>
          </>
        )}

        <Checkbox
          checked={requiresApproval}
          onCheckedChange={(checked) => setRequiresApproval(!!checked)}
          label="Require approval"
        />

        <Button type="submit" variant="primary" className="w-full justify-center text-xs">
          {props.submitButtonText ?? 'Add node'}
        </Button>
      </form>
    </Card>
  )
}
