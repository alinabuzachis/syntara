import { Field } from '@base-ui-components/react'
import clsx from 'clsx'
import type React from 'react'

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, ...rest } = props

  return (
    <Field.Control
      render={(fieldProps) => (
        <textarea
          {...fieldProps}
          {...rest}
          className={clsx(
            'w-full rounded-md bg-white/5 px-3 py-2 font-mono text-xs transition-shadow outline-none focus:ring-2 focus:ring-blue-400/50',
            className
          )}
        />
      )}
    />
  )
}
