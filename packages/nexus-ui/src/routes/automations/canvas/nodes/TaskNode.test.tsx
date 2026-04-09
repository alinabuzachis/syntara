import type { TaskActivity } from '@ansible/nexus-contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { TaskActivityDetails } from './TaskNode'

describe('TaskActivityDetails', () => {
  it('renders script task details correctly', () => {
    const mockScriptTask = {
      type: 'script',
      id: 'task-1',
      name: 'Script Task',
      config: {
        language: 'python',
        code: 'print("hello")',
      },
    } as TaskActivity

    render(<TaskActivityDetails data={mockScriptTask} />)

    expect(screen.getByText('Script Task')).toBeInTheDocument()
    expect(screen.getByText('Script')).toBeInTheDocument()
    expect(screen.getByText('Language')).toBeInTheDocument()
    expect(screen.getByText('python')).toBeInTheDocument()
  })

  it('renders http_request task details correctly', () => {
    const mockHttpTask = {
      type: 'http_request',
      id: 'task-2',
      name: 'HTTP Request Task',
      config: {
        method: 'GET',
        url: 'https://api.example.com',
      },
    } as TaskActivity

    render(<TaskActivityDetails data={mockHttpTask} />)

    expect(screen.getByText('HTTP Request Task')).toBeInTheDocument()
    expect(screen.getByText('REST API')).toBeInTheDocument()
    expect(screen.getByText('GET')).toBeInTheDocument()
    expect(screen.getByText('https://api.example.com')).toBeInTheDocument()
  })

  it('renders agentic task details correctly', () => {
    const mockAgenticTask = {
      type: 'agentic',
      id: 'task-4',
      name: 'AI Agent Task',
      config: {
        model: 'claude-3-sonnet',
        prompt: 'Analyze the data and provide insights',
        tool_selection_strategy: 'SELECTED',
        tool_selections: ['calculator', 'web_search'],
      },
    } as TaskActivity

    render(<TaskActivityDetails data={mockAgenticTask} />)

    expect(screen.getByText('AI Agent Task')).toBeInTheDocument()
    expect(screen.getByText('Agentic')).toBeInTheDocument()
    expect(screen.getByText('Model')).toBeInTheDocument()
    expect(screen.getByText('claude-3-sonnet')).toBeInTheDocument()
    expect(screen.getByText('Tools')).toBeInTheDocument()
    expect(screen.getByText('2 tools')).toBeInTheDocument()
  })

  it.skip('renders AAP job template task details correctly', () => {
    // SKIPPED: SVG import issue with Ansible icon in test environment
    const mockAAPTask = {
      type: 'aap_job_template',
      id: 'task-5',
      name: 'AAP Job',
      config: {
        job_template_id: 123,
        inventory_id: 456,
      },
    } as TaskActivity

    render(<TaskActivityDetails data={mockAAPTask} />)

    expect(screen.getByText('AAP Job')).toBeInTheDocument()
    expect(screen.getByText('Job Template ID')).toBeInTheDocument()
    expect(screen.getByText('123')).toBeInTheDocument()
    expect(screen.getByText('Inventory ID')).toBeInTheDocument()
    expect(screen.getByText('456')).toBeInTheDocument()
  })

  it('renders agentic task with model', () => {
    const mockAgenticTaskWithModel = {
      type: 'agentic',
      id: 'task-6',
      name: 'AI Agent with Model',
      config: {
        model: 'claude-3-opus',
        prompt: 'Analyze these files',
        tool_selection_strategy: 'SELECTED',
        tool_selections: ['code_analysis'],
      },
    } as TaskActivity

    render(<TaskActivityDetails data={mockAgenticTaskWithModel} />)

    expect(screen.getByText('AI Agent with Model')).toBeInTheDocument()
    expect(screen.getByText('claude-3-opus')).toBeInTheDocument()
  })
})
