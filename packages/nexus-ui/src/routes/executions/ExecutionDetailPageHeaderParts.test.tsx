import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { axe } from 'vitest-axe'

import { ExecutionDetailHeaderToolbar, ExecutionDetailTitleRowAddons } from './ExecutionDetailPageHeaderParts'
import { executionDetailHasTitleRowExtras, executionDetailPageHeading } from './executionDetailPageHeaderTitle'

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('executionDetailPageHeaderTitle', () => {
  it('derives heading from workflow metadata when present', () => {
    const execution = {
      workflow_definition: { metadata: { name: 'My workflow' } },
    } as unknown as Parameters<typeof executionDetailPageHeading>[0]
    expect(executionDetailPageHeading(execution, 'exec-id')).toBe('My workflow')
  })

  it('falls back to execution id prefix when metadata missing', () => {
    expect(executionDetailPageHeading(undefined, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toBe('Execution aaaaaaaa...')
  })

  it('detects when title row extras should render', () => {
    expect(executionDetailHasTitleRowExtras(undefined)).toBe(false)
  })
})

describe('ExecutionDetailPageHeaderParts', () => {
  it('renders no addon labels when execution has no status or created time', () => {
    render(<ExecutionDetailTitleRowAddons execution={undefined} />)
    expect(screen.queryByText(/Viewing run/i)).not.toBeInTheDocument()
  })

  it('has no accessibility violations for title row addons with status', async () => {
    const execution = {
      status: 'running' as const,
      created_at: '2024-01-01T00:00:00.000Z',
    } as never
    const { container } = render(<ExecutionDetailTitleRowAddons execution={execution} />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no accessibility violations for header toolbar', async () => {
    const { container } = render(
      <ExecutionDetailHeaderToolbar
        showApprovalActionStrip={false}
        isApprovalLoading={false}
        onReviewClick={() => {}}
        historyCardOpen={false}
        onToggleHistory={() => {}}
        onBackToEditor={() => {}}
      />
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
