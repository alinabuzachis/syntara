import { Table } from '@patternfly/react-table'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { ApprovalsTableHead } from './ApprovalsTableHead'

describe('ApprovalsTableHead', () => {
  it('has no accessibility violations', async () => {
    const getSortParams = vi.fn((columnField: string) => ({
      sortBy: {
        index: 0,
        direction: 'asc' as const,
        defaultDirection: 'asc' as const,
      },
      onSort: vi.fn(),
      columnIndex: 0,
      'aria-label': columnField,
    }))

    const { container } = render(
      <Table aria-label="Approvals" isExpandable>
        <ApprovalsTableHead
          getSortParams={getSortParams}
          allRowsExpanded={false}
          collapseAllAriaLabel="Collapse all rows"
          onCollapseAll={vi.fn()}
        />
      </Table>
    )

    expect(await axe(container)).toHaveNoViolations()
    expect(getSortParams).toHaveBeenCalledWith('name')
    expect(getSortParams).toHaveBeenCalledWith('created_at')
    expect(getSortParams).toHaveBeenCalledWith('decided_at')
    expect(getSortParams).toHaveBeenCalledWith('status')
    expect(getSortParams).not.toHaveBeenCalledWith('workflowName')
  })
})
