import clsx from 'clsx'

import type { NodeTypeDefinition } from '../registry/NodeRegistry'

interface NodeTypeButtonProps {
  nodeType: NodeTypeDefinition
  isSelected: boolean
  onClick: () => void
}

/**
 * Reusable button component for displaying a node type option
 */
export function NodeTypeButton({ nodeType, isSelected, onClick }: NodeTypeButtonProps) {
  const Icon = nodeType.icon

  return (
    <button
      onClick={onClick}
      className={clsx(
        'glass flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-all',
        isSelected ? 'border-blue-400/70 bg-blue-400/10' : 'hover:border-blue-400/50 hover:bg-white/5'
      )}
      title={nodeType.description}
    >
      <Icon className="size-4 text-blue-400/70" />
      <div className="flex-1">
        <div className="text-xs font-medium">{nodeType.label}</div>
        {nodeType.description && <div className="line-clamp-1 text-[10px] text-gray-400">{nodeType.description}</div>}
      </div>
    </button>
  )
}
