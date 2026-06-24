import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

let mockSearchParams = ''
let mockWorkflowQuery: { data: unknown; error: unknown; isLoading: boolean } = {
  data: undefined,
  error: null,
  isLoading: true,
}

vi.mock('wouter', () => ({
  useParams: () => ({ workflowId: 'wf-1' }),
  useSearch: () => mockSearchParams,
}))

vi.mock('../../client', () => ({
  workflowClient: {
    useQuery: () => mockWorkflowQuery,
  },
  executionsClient: {
    useQuery: () => ({ data: undefined }),
  },
}))

vi.mock('./BuilderContent', () => ({
  BuilderContent: (props: { initialViewVersion?: number | null }) => (
    <div data-testid="builder-content" data-version={props.initialViewVersion ?? 'none'} />
  ),
}))

describe('BuilderEdit', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSearchParams = ''
    mockWorkflowQuery = { data: undefined, error: null, isLoading: true }
  })

  it('renders loading state', async () => {
    const { default: BuilderEdit } = await import('./BuilderEdit')
    render(<BuilderEdit />)

    expect(screen.getByText('Loading workflow')).toBeInTheDocument()
  })

  it('renders error state when query fails', async () => {
    mockWorkflowQuery = { data: undefined, error: new Error('Not found'), isLoading: false }
    const { default: BuilderEdit } = await import('./BuilderEdit')
    render(<BuilderEdit />)

    expect(screen.getByRole('heading', { level: 1, name: 'Error loading workflow' })).toBeInTheDocument()
  })

  it('renders BuilderContent with valid version param', async () => {
    mockSearchParams = 'version=3'
    mockWorkflowQuery = { data: { id: 'wf-1', name: 'test' }, error: null, isLoading: false }
    const { default: BuilderEdit } = await import('./BuilderEdit')
    render(<BuilderEdit />)

    const content = screen.getByTestId('builder-content')
    expect(content).toHaveAttribute('data-version', '3')
  })

  it('passes null initialViewVersion when no version param', async () => {
    mockSearchParams = ''
    mockWorkflowQuery = { data: { id: 'wf-1', name: 'test' }, error: null, isLoading: false }
    const { default: BuilderEdit } = await import('./BuilderEdit')
    render(<BuilderEdit />)

    const content = screen.getByTestId('builder-content')
    expect(content).toHaveAttribute('data-version', 'none')
  })

  it('passes null for non-numeric version param', async () => {
    mockSearchParams = 'version=abc'
    mockWorkflowQuery = { data: { id: 'wf-1', name: 'test' }, error: null, isLoading: false }
    const { default: BuilderEdit } = await import('./BuilderEdit')
    render(<BuilderEdit />)

    const content = screen.getByTestId('builder-content')
    expect(content).toHaveAttribute('data-version', 'none')
  })

  it('passes null for negative version param', async () => {
    mockSearchParams = 'version=-1'
    mockWorkflowQuery = { data: { id: 'wf-1', name: 'test' }, error: null, isLoading: false }
    const { default: BuilderEdit } = await import('./BuilderEdit')
    render(<BuilderEdit />)

    const content = screen.getByTestId('builder-content')
    expect(content).toHaveAttribute('data-version', 'none')
  })

  it('passes null for zero version param', async () => {
    mockSearchParams = 'version=0'
    mockWorkflowQuery = { data: { id: 'wf-1', name: 'test' }, error: null, isLoading: false }
    const { default: BuilderEdit } = await import('./BuilderEdit')
    render(<BuilderEdit />)

    const content = screen.getByTestId('builder-content')
    expect(content).toHaveAttribute('data-version', 'none')
  })
})
