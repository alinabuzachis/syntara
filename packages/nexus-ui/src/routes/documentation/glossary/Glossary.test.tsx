import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import Glossary from './Glossary'
import { useGlossaryTerms } from './useGlossaryTerms'
import type { GlossaryTerm } from './useGlossaryTerms'

vi.mock('./useGlossaryTerms', () => ({
  useGlossaryTerms: vi.fn(),
}))

const mockTerms: GlossaryTerm[] = [
  { term: 'Alpha', definition: 'First letter of the alphabet' },
  { term: 'Beta', definition: 'Second letter' },
  { term: 'Workflow', definition: 'A process or automation definition' },
]

describe('Glossary', () => {
  beforeEach(() => {
    vi.mocked(useGlossaryTerms).mockReturnValue(mockTerms)
  })

  it('renders all terms when search is empty', () => {
    render(<Glossary />)

    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByText('Workflow')).toBeInTheDocument()
    expect(screen.getByText('First letter of the alphabet')).toBeInTheDocument()
    expect(screen.getByText('Second letter')).toBeInTheDocument()
    expect(screen.getByText('A process or automation definition')).toBeInTheDocument()
  })

  it('renders search input with placeholder', () => {
    render(<Glossary />)

    expect(screen.getByPlaceholderText('Search glossary...')).toBeInTheDocument()
  })

  it('filters by term when user types in search', async () => {
    const user = userEvent.setup()
    render(<Glossary />)

    await user.type(screen.getByPlaceholderText('Search glossary...'), 'Alpha')

    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('First letter of the alphabet')).toBeInTheDocument()
    // Beta should not match "Alpha" (Fuse fuzzy matching may still include other terms)
    expect(screen.queryByText('Beta')).not.toBeInTheDocument()
  })

  it('filters by definition when search matches definition text', async () => {
    const user = userEvent.setup()
    render(<Glossary />)

    await user.type(screen.getByPlaceholderText('Search glossary...'), 'process')

    expect(screen.getByText('Workflow')).toBeInTheDocument()
    expect(screen.getByText('A process or automation definition')).toBeInTheDocument()
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument()
    expect(screen.queryByText('Beta')).not.toBeInTheDocument()
  })

  it('shows empty state when no matches', async () => {
    const user = userEvent.setup()
    render(<Glossary />)

    await user.type(screen.getByPlaceholderText('Search glossary...'), 'xyznonexistent')

    expect(screen.getByText('No results found')).toBeInTheDocument()
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument()
    expect(screen.queryByText('Beta')).not.toBeInTheDocument()
    expect(screen.queryByText('Workflow')).not.toBeInTheDocument()
  })

  it('clearing search restores all terms', async () => {
    const user = userEvent.setup()
    render(<Glossary />)

    await user.type(screen.getByPlaceholderText('Search glossary...'), 'Alpha')
    expect(screen.queryByText('Beta')).not.toBeInTheDocument()

    await user.clear(screen.getByPlaceholderText('Search glossary...'))

    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByText('Workflow')).toBeInTheDocument()
  })

  it('empty state clear filters restores all terms', async () => {
    const user = userEvent.setup()
    render(<Glossary />)

    await user.type(screen.getByPlaceholderText('Search glossary...'), 'xyznonexistent')
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument()

    const clearButton = screen.getByRole('button', { name: 'Clear all filters' })
    await user.click(clearButton)

    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByText('Workflow')).toBeInTheDocument()
  })
})
