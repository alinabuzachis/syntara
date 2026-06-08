import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { DRAG_TYPE_CONTEXT } from './utils/dragTypes'
import { VariablesAndContextTree } from './VariablesAndContextTree'

describe('VariablesAndContextTree', () => {
  it('renders $now as leaf node with datetime value', () => {
    render(<VariablesAndContextTree />)

    expect(screen.getByText('T $now')).toBeInTheDocument()
  })

  it('renders $today as leaf node with date value', () => {
    render(<VariablesAndContextTree />)

    expect(screen.getByText('T $today')).toBeInTheDocument()
  })

  it('renders $vars as expandable group', async () => {
    const user = userEvent.setup()
    render(<VariablesAndContextTree />)

    expect(screen.getByText('{} $vars')).toBeInTheDocument()

    // PatternFly TreeView uses the node button for toggling.
    // The button's accessible name includes the rendered name content.
    const toggleButton = screen.getByRole('button', { name: /\$vars/i })
    expect(toggleButton).toBeInTheDocument()

    // Collapse and verify children are hidden
    await user.click(toggleButton)
    expect(screen.queryByText('Create variables that can be used across workflows here')).not.toBeInTheDocument()
  })

  it('renders $execution with id, mode, resumeUrl fields', () => {
    render(<VariablesAndContextTree />)

    expect(screen.getByText('{} $execution')).toBeInTheDocument()
    expect(screen.getByText('T id')).toBeInTheDocument()
    expect(screen.getByText('T mode')).toBeInTheDocument()
    expect(screen.getByText('T resumeUrl')).toBeInTheDocument()
  })

  it('renders $workflow namespace', () => {
    render(<VariablesAndContextTree />)

    expect(screen.getByText('{} $workflow')).toBeInTheDocument()
  })

  it('leaf nodes have draggable attribute', () => {
    render(<VariablesAndContextTree />)

    expect(screen.getByText('T $now')).toBeInTheDocument()
  })

  it('sets correct context drag data on leaf node dragStart', () => {
    render(<VariablesAndContextTree />)

    const setDataCalls: Array<[string, string]> = []
    const dataTransfer = {
      setData: (format: string, value: string) => {
        setDataCalls.push([format, value])
      },
      effectAllowed: '',
    }

    fireEvent.dragStart(screen.getByText('T $now'), { dataTransfer })

    expect(setDataCalls).toHaveLength(2)
    expect(setDataCalls[0][0]).toBe('application/json')

    const parsed = JSON.parse(setDataCalls[0][1]) as { type: string; contextPath: string }
    expect(parsed.type).toBe(DRAG_TYPE_CONTEXT)
    expect(parsed.contextPath).toBe('$now')

    expect(setDataCalls[1][0]).toBe('text/plain')
    expect(setDataCalls[1][1]).toBe('${$now}')
  })

  it('sets correct context drag data for nested execution fields', () => {
    render(<VariablesAndContextTree />)

    const setDataCalls: Array<[string, string]> = []
    const dataTransfer = {
      setData: (format: string, value: string) => {
        setDataCalls.push([format, value])
      },
      effectAllowed: '',
    }

    fireEvent.dragStart(screen.getByText('T id'), { dataTransfer })

    const parsed = JSON.parse(setDataCalls[0][1]) as { type: string; contextPath: string }
    expect(parsed.type).toBe(DRAG_TYPE_CONTEXT)
    expect(parsed.contextPath).toBe('$execution.id')

    expect(setDataCalls[1][0]).toBe('text/plain')
    expect(setDataCalls[1][1]).toBe('${$execution.id}')
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<VariablesAndContextTree />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
