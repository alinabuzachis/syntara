import type { WorkflowAPI } from '@syntara/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { FlatWorkflowsTableBody, GroupedWorkflowsTableBody } from './WorkflowsTableBody'

vi.mock('../access-management/useProjectPermissions', () => ({
  useProjectPermissions: () => ({
    canCreate: false,
    canUpdate: false,
    canDelete: false,
    isLoading: false,
    tooltips: { create: '', update: '', delete: '' },
  }),
}))

type Workflow = WorkflowAPI.components['schemas']['WorkflowRead']

const baseWorkflow: Workflow = {
  id: 'wf-1',
  name: 'Deploy Pipeline',
  is_builtin: false,
  published_version_id: null,
  project_id: 'proj-1',
} as Workflow

function renderInTable(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <table>{ui}</table>
    </QueryClientProvider>
  )
}

describe('WorkflowsTableBody', () => {
  const getRowActions = vi.fn(() => [])

  describe('GroupedWorkflowsTableBody', () => {
    it('renders project group header with workflow rows', () => {
      const grouped = new Map([
        ['proj-1', { project: { id: 'proj-1', name: 'Project Alpha' } as never, workflows: [baseWorkflow] }],
      ])

      renderInTable(
        <GroupedWorkflowsTableBody
          groupedWorkflows={grouped}
          collapsedProjects={new Set()}
          onToggleProject={vi.fn()}
          getRowActions={getRowActions}
        />
      )

      expect(screen.getByText('Project Alpha')).toBeInTheDocument()
      expect(screen.getByText('Deploy Pipeline')).toBeInTheDocument()
    })

    it('renders "No project" header for unknown project id', () => {
      const grouped = new Map([['unknown', { project: null, workflows: [baseWorkflow] }]])

      renderInTable(
        <GroupedWorkflowsTableBody
          groupedWorkflows={grouped}
          collapsedProjects={new Set()}
          onToggleProject={vi.fn()}
          getRowActions={getRowActions}
        />
      )

      expect(screen.getByText('No project')).toBeInTheDocument()
      expect(screen.getByText('Deploy Pipeline')).toBeInTheDocument()
    })

    it('hides workflow rows when project group is collapsed', async () => {
      const user = userEvent.setup()
      const onToggleProject = vi.fn()
      const grouped = new Map([
        ['proj-1', { project: { id: 'proj-1', name: 'Project Alpha' } as never, workflows: [baseWorkflow] }],
      ])

      renderInTable(
        <GroupedWorkflowsTableBody
          groupedWorkflows={grouped}
          collapsedProjects={new Set(['proj-1'])}
          onToggleProject={onToggleProject}
          getRowActions={getRowActions}
        />
      )

      expect(screen.getByText('Project Alpha')).toBeInTheDocument()
      expect(screen.queryByText('Deploy Pipeline')).not.toBeInTheDocument()

      await user.click(screen.getByText('Project Alpha'))
      expect(onToggleProject).toHaveBeenCalledWith('proj-1')
    })
  })

  describe('FlatWorkflowsTableBody', () => {
    it('renders workflow rows', () => {
      renderInTable(<FlatWorkflowsTableBody workflows={[baseWorkflow]} getRowActions={getRowActions} />)

      expect(screen.getByText('Deploy Pipeline')).toBeInTheDocument()
    })
  })
})
