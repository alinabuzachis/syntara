/* eslint-disable jsx-a11y/label-has-associated-control */
import { Button } from '@ansible/nexus-ui-framework'
import { useState } from 'react'

interface ActionNodeFormProps {
  onSubmit: (data: {
    name: string
    executor: string
    language?: string
    code?: string
    method?: string
    url?: string
    headers?: string
    body?: string
  }) => void
  onCancel: () => void
}

export function ActionNodeForm(props: ActionNodeFormProps) {
  const [name, setName] = useState('')
  const [executor, setExecutor] = useState('script')
  const [language, setLanguage] = useState('python')
  const [code, setCode] = useState('')
  const [method, setMethod] = useState('GET')
  const [url, setUrl] = useState('')
  const [headers, setHeaders] = useState('')
  const [body, setBody] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    props.onSubmit({
      name,
      executor,
      language: executor === 'script' ? language : undefined,
      code: executor === 'script' ? code : undefined,
      method: executor === 'api' ? method : undefined,
      url: executor === 'api' ? url : undefined,
      headers: executor === 'api' ? headers : undefined,
      body: executor === 'api' ? body : undefined,
    })
  }

  return (
    <div className="glass flex flex-col gap-3 rounded-lg border p-4">
      <h3 className="text-sm font-semibold">Configure Action Task</h3>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-300">Activity Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md bg-white/5 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400/50"
            placeholder="Enter activity name"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-300">Executor Type</label>
          <select
            value={executor}
            onChange={(e) => setExecutor(e.target.value)}
            className="rounded-md bg-white/5 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400/50 [&_option]:bg-gray-800 [&_option]:text-white"
          >
            <option value="script">Script</option>
            <option value="api">API Call</option>
          </select>
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
              <label className="text-xs font-medium text-gray-300">Code</label>
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="rounded-md bg-white/5 px-3 py-1.5 font-mono text-xs outline-none focus:ring-2 focus:ring-blue-400/50"
                placeholder="Enter your code..."
                rows={5}
                required
              />
            </div>
          </>
        )}

        {executor === 'api' && (
          <>
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
              <label className="text-xs font-medium text-gray-300">URL</label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="rounded-md bg-white/5 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400/50"
                placeholder="https://api.example.com/endpoint"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-300">Headers (JSON)</label>
              <textarea
                value={headers}
                onChange={(e) => setHeaders(e.target.value)}
                className="rounded-md bg-white/5 px-3 py-1.5 font-mono text-xs outline-none focus:ring-2 focus:ring-blue-400/50"
                placeholder='{"Content-Type": "application/json"}'
                rows={2}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-300">Body (JSON)</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="rounded-md bg-white/5 px-3 py-1.5 font-mono text-xs outline-none focus:ring-2 focus:ring-blue-400/50"
                placeholder='{"key": "value"}'
                rows={3}
              />
            </div>
          </>
        )}

        <Button type="submit" variant="primary" className="w-full text-xs">
          Add Task
        </Button>
      </form>
    </div>
  )
}
