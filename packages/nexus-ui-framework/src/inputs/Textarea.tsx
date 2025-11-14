import { Field } from '@base-ui-components/react'
import type React from 'react'
import clsx from 'clsx'

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, ...rest } = props

  return (
    <Field.Control
      render={(fieldProps) => (
        <textarea
          {...fieldProps}
          {...rest}
          className={clsx(
            'w-full rounded-lg bg-black/20 px-3 py-2 font-mono text-sm text-white/90 ring ring-white/10 focus:outline-blue-800',
            className
          )}
        />
      )}
    />
  )
}
