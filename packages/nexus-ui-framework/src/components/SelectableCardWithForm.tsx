import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { SelectableCard } from './SelectableCard'

interface SelectableCardWithFormProps {
  /** The icon component to display */
  icon: LucideIcon
  /** The main label text */
  label: string
  /** Optional description text */
  description?: string
  /** Whether the card is currently selected */
  isSelected?: boolean
  /** Click handler for the card */
  onClick?: () => void
  /** Optional tooltip text */
  title?: string
  /** Form content to display when selected */
  form?: ReactNode
  /** Additional CSS classes for the card */
  className?: string
  /** Additional CSS classes for the form container */
  formClassName?: string
}

/**
 * A selectable card that reveals a form when selected.
 * Combines SelectableCard with conditional form rendering.
 */
export function SelectableCardWithForm(props: SelectableCardWithFormProps) {
  const { icon, label, description, isSelected, onClick, title, form, className, formClassName } = props

  return (
    <div className="flex flex-col gap-2">
      <SelectableCard
        icon={icon}
        label={label}
        description={description}
        isSelected={isSelected}
        onClick={onClick}
        title={title}
        className={className}
      />
      {isSelected && form && <div className={formClassName}>{form}</div>}
    </div>
  )
}
