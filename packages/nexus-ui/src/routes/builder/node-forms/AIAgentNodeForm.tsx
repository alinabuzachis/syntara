/* eslint-disable jsx-a11y/label-has-associated-control */
import { Button, Checkbox } from '@ansible/nexus-ui-framework'
import { useState } from 'react'

interface AIAgentNodeFormProps {
  onSubmit: (data: {
    name: string
    agent: string
    tools: string
    prompt: string
    model: string
    requiresApproval?: boolean
  }) => void
  onCancel: () => void
}

export function AIAgentNodeForm(props: AIAgentNodeFormProps) {
  const [name, setName] = useState('')
  const [agent, setAgent] = useState('')
  const [tools, setTools] = useState('')
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState('claude-3-sonnet')
  const [requiresApproval, setRequiresApproval] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    props.onSubmit({ name, agent, tools, prompt, model, requiresApproval: requiresApproval || undefined })
  }

  return (
    <div className="glass flex flex-col gap-3 rounded-lg border p-4">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-300">
            Activity Name <span className="text-red-500">*</span>
          </label>
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
          <label className="text-xs font-medium text-gray-300">
            Agent / MCP Server <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={agent}
            onChange={(e) => setAgent(e.target.value)}
            className="rounded-md bg-white/5 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400/50"
            placeholder="mcp://agent-server"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-300">Tools (comma-separated)</label>
          <input
            type="text"
            value={tools}
            onChange={(e) => setTools(e.target.value)}
            className="rounded-md bg-white/5 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400/50"
            placeholder="tool1, tool2, tool3"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-300">Model</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="rounded-md bg-white/5 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400/50 [&_option]:bg-gray-800 [&_option]:text-white"
          >
            <option value="claude-3-opus">Claude 3 Opus</option>
            <option value="claude-3-sonnet">Claude 3 Sonnet</option>
            <option value="gpt-4">GPT-4</option>
            <option value="gpt-4-turbo">GPT-4 Turbo</option>
            <option value="gemini-pro">Gemini Pro</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-300">Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="rounded-md bg-white/5 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400/50"
            placeholder="Natural language instructions for the agent..."
            rows={3}
          />
        </div>
        <Checkbox
          checked={requiresApproval}
          onCheckedChange={(checked) => setRequiresApproval(!!checked)}
          label="Require approval"
        />
        <Button type="submit" variant="primary" className="w-full justify-center text-xs">
          Add node
        </Button>
      </form>
    </div>
  )
}
