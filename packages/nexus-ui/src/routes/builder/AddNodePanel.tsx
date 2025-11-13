import { Button, Scrollable } from '@ansible/nexus-ui-framework'
import { PlusIcon, XIcon } from 'lucide-react'
import { useState, useMemo } from 'react'
import clsx from 'clsx'
import { NodeRegistry } from './registry/NodeRegistry'

interface AddNodePanelProps {
  onClose: () => void
  onNodeSelect?: (message: string, title: string) => void
  onNodeError?: (error: string, title: string) => void
}

export function AddNodePanel(props: AddNodePanelProps) {
  const [selectedNodeType, setSelectedNodeType] = useState<string | null>(null)

  // Get all registered node types
  const nodeTypes = useMemo(() => NodeRegistry.getAll(), [])

  const handleNodeClick = (nodeId: string) => {
    setSelectedNodeType(selectedNodeType === nodeId ? null : nodeId)
  }

  const handleFormCancel = () => {
    setSelectedNodeType(null)
  }

  // Get the selected node type definition
  const selectedNode = selectedNodeType ? NodeRegistry.get(selectedNodeType) : null

  const renderForm = () => {
    if (!selectedNode) return null

    const FormComponent = selectedNode.formComponent

    return (
      <FormComponent
        onSubmit={(data) => {
          selectedNode.onSubmit(
            data,
            () => {
              // Success callback - just close the panel, no alert
              props.onClose()
            },
            (error) => {
              // Error callback - show error alert
              if (props.onNodeError) {
                props.onNodeError(error, 'Failed to add node')
              }
            }
          )
        }}
        onCancel={handleFormCancel}
      />
    )
  }

  return (
    <div className={clsx('glass flex max-h-full w-64 flex-col gap-4 rounded-4xl border-2 py-6')}>
      <header className="flex items-center justify-between px-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <PlusIcon className="size-5" />
          Add Node
        </h2>
        <Button variant="plain" onClick={props.onClose} className="p-1">
          <XIcon className="size-4" />
        </Button>
      </header>

      <Scrollable className="px-6">
        <div className="flex flex-col gap-1.5">
          {nodeTypes.map((nodeType) => {
            const Icon = nodeType.icon
            const isSelected = selectedNodeType === nodeType.id

            return (
              <div key={nodeType.id} className="flex flex-col gap-2">
                <button
                  onClick={() => handleNodeClick(nodeType.id)}
                  className={clsx(
                    'glass flex items-start gap-2.5 rounded-lg border px-3 py-3 text-left transition-all',
                    isSelected ? 'border-blue-400/70 bg-blue-400/10' : 'hover:border-blue-400/50 hover:bg-white/5'
                  )}
                  title={nodeType.description}
                >
                  <Icon className="size-4 flex-shrink-0 text-blue-400/70" />
                  <div className="flex-1">
                    <div className="text-xs font-medium">{nodeType.label}</div>
                    {nodeType.description && (
                      <div className="mt-1 text-[10px] leading-relaxed text-gray-400">{nodeType.description}</div>
                    )}
                  </div>
                </button>
                {isSelected && <div className="ml-0">{renderForm()}</div>}
              </div>
            )
          })}
        </div>
      </Scrollable>
    </div>
  )
}
