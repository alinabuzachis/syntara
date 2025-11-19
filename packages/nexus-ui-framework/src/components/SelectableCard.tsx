import clsx from 'clsx'
import type { LucideIcon } from 'lucide-react'
import type { ComponentType } from 'react'

interface SelectableCardProps {
  /** The icon component to display */
  icon: LucideIcon | ComponentType
  /** The main label text */
  label: string
  /** Optional description text */
  description?: string
  /** Whether the card is currently selected */
  isSelected?: boolean
  /** Click handler */
  onClick?: () => void
  /** Optional tooltip text */
  title?: string
  /** Additional CSS classes */
  className?: string
}

/**
 * A selectable card component with an icon, label, and optional description.
 * Used for displaying selectable items in panels.
 */
export function SelectableCard(props: SelectableCardProps) {
  const { icon: Icon, label, description, isSelected = false, onClick, title, className } = props

  return (
    <button
      onClick={onClick}
      className={clsx(
        'glass flex items-start gap-2.5 rounded-xl border px-3 py-3 text-left transition-all',
        isSelected ? 'border-blue-400/70 bg-blue-400/10' : 'hover:border-blue-400/50 hover:bg-white/5',
        className
      )}
      title={title}
    >
      <Icon className="size-4 flex-shrink-0 text-white" />
      <div className="flex-1">
        <div className="text-sm font-medium">{label}</div>
        {description && <div className="mt-1 text-xs leading-relaxed text-gray-400">{description}</div>}
      </div>
    </button>
  )
}
