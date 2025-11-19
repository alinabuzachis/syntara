/* eslint-disable jsx-a11y/label-has-associated-control */
import { Button } from '@ansible/nexus-ui-framework'
import { useState } from 'react'

interface LogicNodeFormProps {
  onSubmit: (data: {
    name: string
    logicType: string
    condition?: string
    loopType?: string
    items?: string
    count?: number
    maxIterations?: number
  }) => void
  onCancel: () => void
  submitButtonText?: string
  initialData?: {
    name?: string
    logicType?: string
    condition?: string
    loopType?: string
    items?: string
    count?: number
    maxIterations?: number
  }
}

export function LogicNodeForm(props: LogicNodeFormProps) {
  const [name, setName] = useState(props.initialData?.name ?? '')
  const [logicType, setLogicType] = useState(props.initialData?.logicType ?? 'condition')
  const [condition, setCondition] = useState(props.initialData?.condition ?? '')
  const [loopType, setLoopType] = useState(props.initialData?.loopType ?? 'forEach')
  const [items, setItems] = useState(props.initialData?.items ?? '')
  const [count, setCount] = useState(props.initialData?.count ?? 10)
  const [maxIterations, setMaxIterations] = useState(props.initialData?.maxIterations ?? 1000)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    props.onSubmit({
      name,
      logicType,
      condition: logicType === 'condition' || (logicType === 'loop' && loopType === 'while') ? condition : undefined,
      loopType: logicType === 'loop' ? loopType : undefined,
      items: logicType === 'loop' && loopType === 'forEach' ? items : undefined,
      count: logicType === 'loop' && loopType === 'count' ? count : undefined,
      maxIterations: logicType === 'loop' && loopType === 'while' ? maxIterations : undefined,
    })
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
          <label className="text-xs font-medium text-gray-300">Logic Type</label>
          <select
            value={logicType}
            onChange={(e) => setLogicType(e.target.value)}
            className="rounded-md bg-white/5 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400/50 [&_option]:bg-gray-800 [&_option]:text-white"
          >
            <option value="condition">Condition (If/Else)</option>
            <option value="loop">Loop</option>
          </select>
        </div>

        {logicType === 'condition' && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-300">
              Condition Expression <span className="text-red-500">*</span>
            </label>
            <textarea
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              className="rounded-md bg-white/5 px-3 py-1.5 font-mono text-xs outline-none focus:ring-2 focus:ring-blue-400/50"
              placeholder="${output.status == 'success'}"
              rows={2}
              required
            />
          </div>
        )}

        {logicType === 'loop' && (
          <>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-300">Loop Type</label>
              <select
                value={loopType}
                onChange={(e) => setLoopType(e.target.value)}
                className="rounded-md bg-white/5 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400/50 [&_option]:bg-gray-800 [&_option]:text-white"
              >
                <option value="forEach">For Each</option>
                <option value="while">While</option>
                <option value="count">Count</option>
              </select>
            </div>

            {loopType === 'forEach' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-gray-300">
                  Items Expression <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={items}
                  onChange={(e) => setItems(e.target.value)}
                  className="rounded-md bg-white/5 px-3 py-1.5 font-mono text-xs outline-none focus:ring-2 focus:ring-blue-400/50"
                  placeholder="${input.users}"
                  required
                />
              </div>
            )}

            {loopType === 'while' && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-gray-300">
                    Condition Expression <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={condition}
                    onChange={(e) => setCondition(e.target.value)}
                    className="rounded-md bg-white/5 px-3 py-1.5 font-mono text-xs outline-none focus:ring-2 focus:ring-blue-400/50"
                    placeholder="${counter < 10}"
                    rows={2}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-gray-300">Max Iterations</label>
                  <input
                    type="number"
                    value={maxIterations}
                    onChange={(e) => setMaxIterations(Number(e.target.value))}
                    className="rounded-md bg-white/5 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400/50"
                    min={1}
                  />
                </div>
              </>
            )}

            {loopType === 'count' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-gray-300">
                  Iteration Count <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="rounded-md bg-white/5 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400/50"
                  min={1}
                  required
                />
              </div>
            )}
          </>
        )}

        <Button type="submit" variant="primary" className="w-full justify-center text-xs">
          {props.submitButtonText ?? 'Add node'}
        </Button>
      </form>
    </div>
  )
}
