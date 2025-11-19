import type { LucideIcon } from 'lucide-react'
import type { ComponentType, ReactNode } from 'react'

interface LabelProps {
  /** Icon component to display (Lucide icon or custom component) */
  icon?: LucideIcon | ComponentType<{ className?: string }>
  /** Text to display */
  children?: ReactNode
  /** Additional CSS classes */
  className?: string
}

/**
 * Label component that displays an icon and/or text
 * Commonly used for section headers, form titles, or node type identifiers
 */
export function Label({ icon: Icon, children, className = '' }: LabelProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {Icon && <Icon className="size-4 text-gray-300" />}
      {children && <span className="text-sm font-medium text-gray-200">{children}</span>}
    </div>
  )
}
