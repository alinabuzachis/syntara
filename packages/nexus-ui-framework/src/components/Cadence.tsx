import { Field } from './Field'
import { NativeSelect } from './NativeSelect'

export type CadenceValue = 'none' | 'daily' | 'weekly' | 'monthly' | 'annually'

export interface CadenceProps {
  /** The current cadence value */
  value?: CadenceValue
  /** Callback when the cadence changes */
  onChange?: (value: CadenceValue) => void
  /** Optional label to display above the select */
  label?: string
  /** Whether the field is required (shows asterisk) */
  required?: boolean
  /** Additional CSS classes */
  className?: string
  /** Whether the field has an error state */
  error?: boolean
  /** Whether the field is disabled */
  disabled?: boolean
}

const cadenceOptions: { value: CadenceValue; label: string }[] = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'annually', label: 'Annually' },
]

/**
 * Cadence Component
 *
 * A select dropdown for choosing workflow recurrence cadence.
 *
 * @example
 * ```tsx
 * <Cadence
 *   value="daily"
 *   onChange={(value) => console.log(value)}
 *   label="Recurrence"
 *   required
 * />
 * ```
 */
export function Cadence(props: CadenceProps) {
  const { value = 'none', onChange, label, required = false, className = '', error = false, disabled = false } = props

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange?.(e.target.value as CadenceValue)
  }

  const content = (
    <NativeSelect
      id="cadence-select"
      value={value}
      onChange={handleChange}
      error={error}
      disabled={disabled}
      aria-label={label || 'Cadence'}
    >
      {cadenceOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </NativeSelect>
  )

  if (label) {
    return (
      <div className={className}>
        <Field label={label} htmlFor="cadence-select" required={required}>
          {content}
        </Field>
      </div>
    )
  }

  return <div className={className}>{content}</div>
}
