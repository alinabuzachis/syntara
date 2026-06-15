import type { ExecutionsAPI } from '@ansible/nexus-contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ActivityStatusLabel, StatusLabel } from './ExecutionStatus'

type ActivityStatus = ExecutionsAPI.components['schemas']['ActivityStatus']

describe('StatusLabel', () => {
  it.each([
    ['pending', 'Pending'],
    ['running', 'Running'],
    ['paused', 'Paused'],
    ['completed', 'Completed'],
    ['completed_with_errors', 'Completed with errors'],
    ['failed', 'Failed'],
    ['cancelled', 'Cancelled'],
  ] as const)('renders "%s" as "%s"', (status, label) => {
    render(<StatusLabel status={status} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })
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

  it('renders "waiting" as "Waiting for approval" for non-wait nodes', () => {
    render(<ActivityStatusLabel status="waiting" />)
    expect(screen.getByText('Waiting for approval')).toBeInTheDocument()
  })

  it('renders "waiting" as "Running" for wait nodes', () => {
    render(<ActivityStatusLabel status="waiting" nodeType="wait" />)
    expect(screen.getByText('Running')).toBeInTheDocument()
  })
})
