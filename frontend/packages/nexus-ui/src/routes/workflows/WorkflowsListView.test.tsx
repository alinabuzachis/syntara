import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import type { WorkflowsListViewProps } from './WorkflowsListView'
import { WorkflowsListView } from './WorkflowsListView'

vi.mock('./WorkflowsTableBody', () => ({
  FlatWorkflowsTableBody: () => <tbody />,
  GroupedWorkflowsTableBody: () => <tbody />,
}))

const defaultProps: WorkflowsListViewProps = {
  isPending: false,
  error: null,
  onRetry: vi.fn(),
  sortedWorkflows: [],
  hasActiveFilters: false,
  filterFieldDefinitions: [],
  filters: [],
  onFilterChange: vi.fn(),
  onClearAllFilters: vi.fn(),
  onCreateWorkflow: vi.fn(),
  isAllProjects: false,
  groupedWorkflows: null,
  collapsedProjects: new Set(),
  onToggleProject: vi.fn(),
  getRowActions: vi.fn().mockReturnValue([]),
}

describe('WorkflowsListView', () => {
  it('has no accessibility violations in the no-data empty state', async () => {
    const { container } = render(<WorkflowsListView {...defaultProps} />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no accessibility violations with active filters', async () => {
    const { container } = render(<WorkflowsListView {...defaultProps} hasActiveFilters />)
    expect(await axe(container)).toHaveNoViolations()
  })

  describe('no-data empty state', () => {
    it('renders the no-data empty state when there are no workflows and no active filters', () => {
      render(<WorkflowsListView {...defaultProps} />)
      expect(screen.getByText('No workflows yet')).toBeInTheDocument()
      expect(screen.getByText('Create your first workflow to get started.')).toBeInTheDocument()
    })

    it('hides the filter bar in the no-data state', () => {
      render(<WorkflowsListView {...defaultProps} />)
      expect(screen.queryByRole('search', { name: 'Filters' })).not.toBeInTheDocument()
    })

    it('calls onCreateWorkflow when the create button is clicked', async () => {
      const user = userEvent.setup()
      const onCreateWorkflow = vi.fn()
      render(<WorkflowsListView {...defaultProps} onCreateWorkflow={onCreateWorkflow} />)
      await user.click(screen.getByRole('button', { name: 'Create workflow' }))
      expect(onCreateWorkflow).toHaveBeenCalledOnce()
    })
  })

  describe('filter empty state', () => {
    it('renders the filter empty state when there are no workflows but active filters are applied', () => {
      render(<WorkflowsListView {...defaultProps} hasActiveFilters />)
      expect(screen.getByText('No results found')).toBeInTheDocument()
    })

    it('does not render the no-data empty state when filters are active', () => {
      render(<WorkflowsListView {...defaultProps} hasActiveFilters />)
      expect(screen.queryByText('No workflows yet')).not.toBeInTheDocument()
    })

    it('calls onClearAllFilters when the clear filters button is clicked', async () => {
      const user = userEvent.setup()
      const onClearAllFilters = vi.fn()
      render(<WorkflowsListView {...defaultProps} hasActiveFilters onClearAllFilters={onClearAllFilters} />)
      await user.click(screen.getByRole('button', { name: 'Clear all filters' }))
      expect(onClearAllFilters).toHaveBeenCalledOnce()
    })
  })

  describe('table state', () => {
    const mockWorkflows = [{ id: '1', name: 'My Workflow' }] as never

    it('renders column headers when workflows are present', () => {
      render(<WorkflowsListView {...defaultProps} sortedWorkflows={mockWorkflows} />)
      expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: 'Created at' })).toBeInTheDocument()
    })

    it('does not render the no-data empty state when workflows are present', () => {
      render(<WorkflowsListView {...defaultProps} sortedWorkflows={mockWorkflows} />)
      expect(screen.queryByText('No workflows yet')).not.toBeInTheDocument()
    })

    it('calls onClearAllFilters from the toolbar clear button', async () => {
      const user = userEvent.setup()
      const onClearAllFilters = vi.fn()
      render(
        <WorkflowsListView
          {...defaultProps}
          sortedWorkflows={mockWorkflows}
          hasActiveFilters
          filters={[{ key: 'name', operator: 'contains' as const, value: 'test' }]}
          onClearAllFilters={onClearAllFilters}
        />
      )
      await user.click(screen.getByRole('button', { name: 'Clear all filters' }))
      expect(onClearAllFilters).toHaveBeenCalledOnce()
    })
  })
})
