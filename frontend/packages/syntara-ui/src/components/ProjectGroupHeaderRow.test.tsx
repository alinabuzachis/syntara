import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { ProjectGroupHeaderRow } from './ProjectGroupHeaderRow'

function renderInTable(ui: ReactNode) {
  return render(
    <table>
      <tbody>{ui}</tbody>
    </table>
  )
}

describe('ProjectGroupHeaderRow', () => {
  it('renders project name in group header', () => {
    renderInTable(
      <ProjectGroupHeaderRow
        projectId="proj-1"
        projectName="Project Alpha"
        isCollapsed={false}
        colSpan={5}
        onToggle={vi.fn()}
      />
    )

    expect(screen.getByText('Project Alpha')).toBeInTheDocument()
  })

  it('shows "No project" label for unknown project id', () => {
    renderInTable(
      <ProjectGroupHeaderRow
        projectId="unknown"
        projectName={undefined}
        isCollapsed={false}
        colSpan={5}
        onToggle={vi.fn()}
      />
    )

    expect(screen.getByText('No project')).toBeInTheDocument()
  })

  it('shows collapsed caret when isCollapsed is true', () => {
    renderInTable(
      <ProjectGroupHeaderRow
        projectId="proj-1"
        projectName="Project Alpha"
        isCollapsed={true}
        colSpan={5}
        onToggle={vi.fn()}
      />
    )

    expect(screen.getByText('Project Alpha')).toBeInTheDocument()
  })

  it('falls back to project id when project name is missing', () => {
    renderInTable(
      <ProjectGroupHeaderRow
        projectId="proj-orphan"
        projectName={undefined}
        isCollapsed={false}
        colSpan={5}
        onToggle={vi.fn()}
      />
    )

    expect(screen.getByText('proj-orphan')).toBeInTheDocument()
  })

  it('calls onToggle when header row is clicked', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()

    renderInTable(
      <ProjectGroupHeaderRow
        projectId="proj-1"
        projectName="Project Alpha"
        isCollapsed={true}
        colSpan={5}
        onToggle={onToggle}
      />
    )

    await user.click(screen.getByText('Project Alpha'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})
