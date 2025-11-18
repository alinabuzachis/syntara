import { Input as BaseInput } from '@base-ui-components/react'
import type React from 'react'

export function Input(props: React.ComponentProps<typeof BaseInput>) {
  const { className, ...rest } = props
  return (
    <BaseInput
      className={`w-full rounded-md bg-white/5 px-3 py-1.5 text-xs transition-shadow outline-none focus:ring-2 focus:ring-blue-400/50 ${className || ''}`}
      {...rest}
    />
  )
}
