import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import type { WorkflowMetadata } from '../types/workflowMetadata'

import { DRAG_TYPE_CONTEXT } from './utils/dragTypes'
import { VariablesAndContextTree } from './VariablesAndContextTree'

const SAMPLE_METADATA: WorkflowMetadata = {
  name: 'My Test Workflow',
  id: 'abc-123',
  version: 3,
  published: true,
  author: 'Jane Doe',
}

describe('VariablesAndContextTree', () => {
  it('renders $vars as expandable group', async () => {
    const user = userEvent.setup()
    render(<VariablesAndContextTree />)

    expect(screen.getByText('{} $vars')).toBeInTheDocument()

    const toggleButton = screen.getByRole('button', { name: /\$vars/i })
    expect(toggleButton).toBeInTheDocument()

    await user.click(toggleButton)
    expect(screen.queryByText('Create variables that can be used across workflows here')).not.toBeInTheDocument()
  })

  it('renders workflow_context namespace with workflow and execution groups', () => {
    render(<VariablesAndContextTree />)

    expect(screen.getByText('{} workflow_context')).toBeInTheDocument()
    expect(screen.getByText('{} workflow')).toBeInTheDocument()
    expect(screen.getByText('{} execution')).toBeInTheDocument()
  })

  it('renders now and today as runtime fields', () => {
    render(<VariablesAndContextTree />)

    expect(screen.getByText('T now')).toBeInTheDocument()
    expect(screen.getByText('T today')).toBeInTheDocument()
  })

  it('renders execution fields with runtime placeholder', () => {
    render(<VariablesAndContextTree />)

    expect(screen.getByText('T created_by')).toBeInTheDocument()
    expect(screen.getByText('T created_at')).toBeInTheDocument()
    expect(screen.getByText('T workflow_version_id')).toBeInTheDocument()
  })

  it('renders workflow metadata fields with actual values', () => {
    render(<VariablesAndContextTree workflowMetadata={SAMPLE_METADATA} />)

    expect(screen.getByText('My Test Workflow')).toBeInTheDocument()
    expect(screen.getByText('abc-123')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('true')).toBeInTheDocument()
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
  })

  it('renders fallback text when no metadata provided', () => {
    render(<VariablesAndContextTree />)

    const fallbacks = screen.getAllByText('[no workflow loaded]')
    expect(fallbacks).toHaveLength(5)
  })

  it('sets correct drag data for workflow name field', () => {
    render(<VariablesAndContextTree workflowMetadata={SAMPLE_METADATA} />)

    const setDataCalls: Array<[string, string]> = []
    const dataTransfer = {
      setData: (format: string, value: string) => {
        setDataCalls.push([format, value])
      },
      effectAllowed: '',
    }

    fireEvent.dragStart(screen.getByText('T name'), { dataTransfer })

    const parsed = JSON.parse(setDataCalls[0][1]) as { type: string; contextPath: string }
    expect(parsed.type).toBe(DRAG_TYPE_CONTEXT)
    expect(parsed.contextPath).toBe('workflow_context.workflow.name')
    expect(setDataCalls[1][1]).toBe('${workflow_context.workflow.name}')
  })

  it('sets correct drag data for execution id field', () => {
    render(<VariablesAndContextTree />)

    const setDataCalls: Array<[string, string]> = []
    const dataTransfer = {
      setData: (format: string, value: string) => {
        setDataCalls.push([format, value])
      },
      effectAllowed: '',
    }

    const idElements = screen.getAllByText('T id')
    fireEvent.dragStart(idElements[1], { dataTransfer })

    const parsed = JSON.parse(setDataCalls[0][1]) as { type: string; contextPath: string }
    expect(parsed.type).toBe(DRAG_TYPE_CONTEXT)
    expect(parsed.contextPath).toBe('workflow_context.execution.id')
    expect(setDataCalls[1][1]).toBe('${workflow_context.execution.id}')
  })

  it('has no accessibility violations without metadata', async () => {
    const { container } = render(<VariablesAndContextTree />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations with metadata', async () => {
    const { container } = render(<VariablesAndContextTree workflowMetadata={SAMPLE_METADATA} />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
