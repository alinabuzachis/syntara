import type { ExecutionsAPI } from '@ansible/nexus-contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ActivityStatusLabel, StatusLabel } from './ExecutionStatus'

type ActivityStatus = ExecutionsAPI.components['schemas']['ActivityStatus']

describe('StatusLabel', () => {
  it.each(['pending', 'running', 'paused', 'completed', 'failed', 'cancelled'] as const)(
    'renders "%s" with capitalized text',
    (status) => {
      render(<StatusLabel status={status} />)
      expect(screen.getByText(status.charAt(0).toUpperCase() + status.slice(1))).toBeInTheDocument()
    }
  )
})

describe('ActivityStatusLabel', () => {
  it.each<[ActivityStatus, string]>([
    ['pending', 'Pending'],
    ['running', 'Running'],
    ['completed', 'Successful'],
    ['failed', 'Failed'],
    ['retrying', 'Retrying'],
    ['skipped', 'Skipped'],
    ['cancelled', 'Cancelled'],
  ])('renders "%s" as "%s"', (status, label) => {
    render(<ActivityStatusLabel status={status} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('uses PatternFly Label component', () => {
    render(<ActivityStatusLabel status="completed" />)

    expect(screen.getByText('Successful')).toBeInTheDocument()
  })
})
