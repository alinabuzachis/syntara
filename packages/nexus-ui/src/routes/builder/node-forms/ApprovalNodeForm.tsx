/* eslint-disable jsx-a11y/label-has-associated-control */
import { Button } from '@ansible/nexus-ui-framework'
import { useState } from 'react'

interface ApprovalNodeFormProps {
  onSubmit: (data: { name: string; approvers: string; prompt: string; timeout: string; onTimeout: string }) => void
  onCancel: () => void
}

export function ApprovalNodeForm(props: ApprovalNodeFormProps) {
  const [name, setName] = useState('')
  const [approvers, setApprovers] = useState('')
  const [prompt, setPrompt] = useState('')
  const [timeout, setTimeout] = useState('P1D')
  const [onTimeout, setOnTimeout] = useState('fail')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    props.onSubmit({ name, approvers, prompt, timeout, onTimeout })
  }

  return (
    <div className="glass flex flex-col gap-3 rounded-lg border p-4">
      <h3 className="text-sm font-semibold">Configure Approval</h3>
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
          <label className="text-xs font-medium text-gray-300">Approvers (comma-separated)</label>
          <input
            type="text"
            value={approvers}
            onChange={(e) => setApprovers(e.target.value)}
            className="rounded-md bg-white/5 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400/50"
            placeholder="user1@example.com, user2@example.com"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-300">Approval Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="rounded-md bg-white/5 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400/50"
            placeholder="Please approve this deployment to production"
            rows={3}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-300">Timeout (ISO 8601)</label>
          <input
            type="text"
            value={timeout}
            onChange={(e) => setTimeout(e.target.value)}
            className="rounded-md bg-white/5 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400/50"
            placeholder="P1D"
          />
          <p className="text-xs text-gray-400">Examples: PT1H (1 hour), PT30M (30 min), P1D (1 day)</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-300">On Timeout</label>
          <select
            value={onTimeout}
            onChange={(e) => setOnTimeout(e.target.value)}
            className="rounded-md bg-white/5 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400/50 [&_option]:bg-gray-800 [&_option]:text-white"
          >
            <option value="fail">Fail</option>
            <option value="approve">Auto-Approve</option>
            <option value="reject">Auto-Reject</option>
          </select>
        </div>
        <Button type="submit" variant="primary" className="w-full text-xs">
          Add Approval
        </Button>
      </form>
    </div>
  )
}
