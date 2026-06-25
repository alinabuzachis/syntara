import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { EnableToolsWrapper } from './EnableToolsStep'

const mockTools = [
  { name: 'get_repo', description: 'Get a repository' },
  { name: 'create_pr', description: 'Create a pull request' },
  { name: 'list_issues', description: 'List open issues' },
]

const allSelected = new Set(mockTools.map((t) => t.name))
const noop = () => {}

describe('EnableToolsStep', () => {
  describe('Empty states', () => {
    it('shows prompt when testResult is null', () => {
      render(<EnableToolsWrapper testResult={null} selectedNames={new Set()} onSelectionChange={noop} />)

      expect(screen.getByText(/No tools discovered yet/i)).toBeInTheDocument()
      expect(screen.getByText(/Test the connection/i)).toBeInTheDocument()
    })

    it('shows failure message when testResult.success is false', () => {
      render(
        <EnableToolsWrapper
          testResult={{ success: false, checked_at: '2026-01-01T00:00:00Z', error: 'Connection timeout' }}
          selectedNames={new Set()}
          onSelectionChange={noop}
        />
      )

      expect(screen.getByText(/connection test failed/i)).toBeInTheDocument()
      expect(screen.getByText(/connection timeout/i)).toBeInTheDocument()
    })

    it('shows no tools message when discovered_tools is empty', () => {
      render(
        <EnableToolsWrapper
          testResult={{ success: true, checked_at: '2026-01-01T00:00:00Z', discovered_tools: [] }}
          selectedNames={new Set()}
          onSelectionChange={noop}
        />
      )

      expect(screen.getByText(/no tools found/i)).toBeInTheDocument()
    })
  })

  describe('Tool selection', () => {
    it('renders tools table with all tools selected', () => {
      const onSelectionChange = vi.fn()

      render(
        <EnableToolsWrapper
          testResult={{ success: true, checked_at: '2026-01-01T00:00:00Z', discovered_tools: mockTools }}
          selectedNames={allSelected}
          onSelectionChange={onSelectionChange}
        />
      )

      expect(screen.getByText('get_repo')).toBeInTheDocument()
      expect(screen.getByText('create_pr')).toBeInTheDocument()
      expect(screen.getByText('list_issues')).toBeInTheDocument()
    })

    it('toggles individual tool selection', async () => {
      const user = userEvent.setup()
      const onSelectionChange = vi.fn()

      render(
        <EnableToolsWrapper
          testResult={{ success: true, checked_at: '2026-01-01T00:00:00Z', discovered_tools: mockTools }}
          selectedNames={allSelected}
          onSelectionChange={onSelectionChange}
        />
      )

      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[1])

      expect(onSelectionChange).toHaveBeenCalled()
    })

    it('select-all toggles all tools', async () => {
      const user = userEvent.setup()
      const onSelectionChange = vi.fn()

      render(
        <EnableToolsWrapper
          testResult={{ success: true, checked_at: '2026-01-01T00:00:00Z', discovered_tools: mockTools }}
          selectedNames={allSelected}
          onSelectionChange={onSelectionChange}
        />
      )

      const selectAllCheckbox = screen.getAllByRole('checkbox')[0]
      await user.click(selectAllCheckbox)

      expect(onSelectionChange).toHaveBeenCalled()
    })

    it('filters tools by name', async () => {
      const user = userEvent.setup()

      render(
        <EnableToolsWrapper
          testResult={{ success: true, checked_at: '2026-01-01T00:00:00Z', discovered_tools: mockTools }}
          selectedNames={allSelected}
          onSelectionChange={noop}
        />
      )

      await user.type(screen.getByRole('textbox', { name: /filter by name/i }), 'repo')

      expect(screen.getByText('get_repo')).toBeInTheDocument()
      expect(screen.queryByText('create_pr')).not.toBeInTheDocument()
      expect(screen.queryByText('list_issues')).not.toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('has no accessibility violations with tools', async () => {
      const { container } = render(
        <EnableToolsWrapper
          testResult={{ success: true, checked_at: '2026-01-01T00:00:00Z', discovered_tools: mockTools }}
          selectedNames={allSelected}
          onSelectionChange={noop}
        />
      )

      let results: Awaited<ReturnType<typeof axe>>
      await act(async () => {
        results = await axe(container)
      })
      expect(results!).toHaveNoViolations()
    })

    it('has no accessibility violations with empty state', async () => {
      const { container } = render(
        <EnableToolsWrapper testResult={null} selectedNames={new Set()} onSelectionChange={noop} />
      )

      let results: Awaited<ReturnType<typeof axe>>
      await act(async () => {
        results = await axe(container)
      })
      expect(results!).toHaveNoViolations()
    })
  })
})
