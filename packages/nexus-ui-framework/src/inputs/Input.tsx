import { Input as BaseInput } from '@base-ui-components/react'
import type React from 'react'

export function Input(props: React.ComponentProps<typeof BaseInput>) {
  return (
    <BaseInput
      className="w-full rounded-lg bg-black/20 px-3 py-1.5 text-white/90 ring ring-white/10 focus:outline-blue-800"
      {...props}
    />
  )
}
