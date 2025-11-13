/* eslint-disable jsx-a11y/label-has-associated-control */
import { Button } from '@ansible/nexus-ui-framework'
import { useState } from 'react'

interface AAPNodeFormProps {
  onSubmit: (data: { name: string; connectorId: string; operation: string; parameters: string }) => void
  onCancel: () => void
}

export function AAPNodeForm(props: AAPNodeFormProps) {
  const [name, setName] = useState('')
  const [connectorId, setConnectorId] = useState('')
  const [operation, setOperation] = useState('launch_job')
  const [parameters, setParameters] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    props.onSubmit({ name, connectorId, operation, parameters })
  }

  return (
    <div className="glass flex flex-col gap-3 rounded-lg border p-4">
      <h3 className="text-sm font-semibold">Configure AAP Job Task</h3>
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
          <label className="text-xs font-medium text-gray-300">Connector ID</label>
          <input
            type="text"
            value={connectorId}
            onChange={(e) => setConnectorId(e.target.value)}
            className="rounded-md bg-white/5 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400/50"
            placeholder="ansible-automation-platform"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-300">Operation</label>
          <select
            value={operation}
            onChange={(e) => setOperation(e.target.value)}
            className="rounded-md bg-white/5 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400/50 [&_option]:bg-gray-800 [&_option]:text-white"
          >
            <option value="launch_job">Launch Job Template</option>
            <option value="launch_workflow">Launch Workflow Template</option>
            <option value="get_job_status">Get Job Status</option>
            <option value="cancel_job">Cancel Job</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-300">Parameters (JSON)</label>
          <textarea
            value={parameters}
            onChange={(e) => setParameters(e.target.value)}
            className="rounded-md bg-white/5 px-3 py-1.5 font-mono text-xs outline-none focus:ring-2 focus:ring-blue-400/50"
            placeholder='{"job_template_id": "123", "extra_vars": {}}'
            rows={4}
          />
        </div>
        <Button type="submit" variant="primary" className="w-full text-xs">
          Add Task
        </Button>
      </form>
    </div>
  )
}
