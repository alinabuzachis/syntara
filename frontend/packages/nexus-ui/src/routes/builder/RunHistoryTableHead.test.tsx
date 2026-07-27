import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { RunHistoryTableHead } from './RunHistoryTableHead'

describe('RunHistoryTableHead', () => {
  it('renders compact sortable column headers', () => {
    const getSortParams = vi.fn((field: string) =>
      field === 'duration'
        ? undefined
        : {
            sortBy: { index: 2, direction: 'desc' as const, defaultDirection: 'asc' as const },
            onSort: vi.fn(),
            columnIndex: field === 'created_at' ? 2 : 0,
          }
    )

    render(<RunHistoryTableHead getSortParams={getSortParams} />)

    expect(screen.getByRole('columnheader', { name: /Run ID/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Version/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Started/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Duration/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Status/i })).toBeInTheDocument()
    expect(getSortParams).toHaveBeenCalledWith('id')
    expect(getSortParams).toHaveBeenCalledWith('workflow_version_id')
    expect(getSortParams).toHaveBeenCalledWith('created_at')
    expect(getSortParams).toHaveBeenCalledWith('status')
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <RunHistoryTableHead
        getSortParams={() => ({
          sortBy: { index: 2, direction: 'desc', defaultDirection: 'asc' },
          onSort: vi.fn(),
          columnIndex: 2,
        })}
      />
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
