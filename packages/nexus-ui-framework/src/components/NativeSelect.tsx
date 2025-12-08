import { forwardRef, type SelectHTMLAttributes } from 'react'

export interface NativeSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean
}

/**
 * Styled native select component matching the form styling used in node forms.
 * For simple dropdowns without the complexity of Base UI Select.
 */
export const NativeSelect = forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, error, disabled, ...props }, ref) => {
    return (
      <select
        ref={ref}
        disabled={disabled}
        className={`rounded-md bg-white/5 px-3 py-1.5 text-xs transition-shadow outline-none focus:ring-2 ${
          error ? 'ring-2 ring-red-400/50 focus:ring-red-400' : 'focus:ring-blue-400/50'
        } [&_option]:bg-gray-800 [&_option]:text-white ${disabled ? 'cursor-not-allowed opacity-50' : ''} ${className || ''}`}
        {...props}
      />
    )
  }
)

NativeSelect.displayName = 'NativeSelect'
