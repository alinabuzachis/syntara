import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { BuilderWorkflowAppPageHeader } from './BuilderWorkflowAppPageHeader'

describe('BuilderWorkflowAppPageHeader', () => {
  const baseProps = {
    workflowName: 'wf',
    workflowDescription: '',
    workflowTags: [] as string[],
    isNew: true,
    workflow: undefined as { id: string } | undefined,
    isViewingExecution: false,
    selectedExecutionCreatedAt: undefined as string | undefined,
    historyCardOpen: false,
    isPending: false,
    selectedProject: null,
    isEnabled: true,
    isKebabOpen: false,
    ProjectSelector: <span>Project</span>,
    dispatch: vi.fn(),
    markDirty: vi.fn(),
    handleToggleHistory: vi.fn(),
    handleToggleDetails: vi.fn(),
    handleSaveWorkflow: vi.fn(),
  }

  it('has no accessibility violations in editor mode', async () => {
    const { container } = render(<BuilderWorkflowAppPageHeader {...baseProps} />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no accessibility violations when viewing execution', async () => {
    const { container } = render(
      <BuilderWorkflowAppPageHeader
        {...baseProps}
        isViewingExecution
        selectedExecutionCreatedAt="2024-01-01T00:00:00.000Z"
      />
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
