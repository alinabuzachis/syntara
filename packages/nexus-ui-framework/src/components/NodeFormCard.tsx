import type { ReactNode } from 'react'

import { Card } from './Card'
import { Heading } from './Heading'

export interface NodeFormCardProps {
  title: string
  children: ReactNode
  onSubmit?: (e: React.FormEvent) => void
}

/**
 * A standardized card wrapper for node configuration forms.
 * Provides consistent styling and structure across all node forms.
 */
export function NodeFormCard(props: NodeFormCardProps) {
  const content = (
    <>
      <Heading level={3} size="sm">
        {props.title}
      </Heading>
      {props.children}
    </>
  )

  if (props.onSubmit) {
    return (
      <Card variant="glass" padding="md" className="flex flex-col gap-3">
        <form onSubmit={props.onSubmit} className="flex flex-col gap-3">
          {content}
        </form>
      </Card>
    )
  }

  return (
    <Card variant="glass" padding="md" className="flex flex-col gap-3">
      {content}
    </Card>
  )
}
