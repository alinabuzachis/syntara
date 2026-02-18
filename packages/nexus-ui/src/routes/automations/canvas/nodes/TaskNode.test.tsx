import type { TaskActivity } from '@ansible/nexus-contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { TaskActivityDetails } from './TaskNode'

describe('TaskActivityDetails', () => {
  it('renders script task details correctly', () => {
    const mockScriptTask: TaskActivity = {
      type: 'task',
      id: 'task-1',
      name: 'Script Task',
      task: {
        executor: 'script',
        config: {
          language: 'python',
          code: 'print("hello")',
        },
      },
    }

    render(<TaskActivityDetails data={mockScriptTask} />)

    expect(screen.getByText('Script Task')).toBeInTheDocument()
    expect(screen.getByText('Script')).toBeInTheDocument()
    expect(screen.getByText('Language')).toBeInTheDocument()
    expect(screen.getByText('python')).toBeInTheDocument()
  })

  it('renders api task details correctly', () => {
    const mockApiTask: TaskActivity = {
      type: 'task',
      id: 'task-2',
      name: 'API Task',
      task: {
        executor: 'api',
        config: {
          method: 'GET',
          url: 'https://api.example.com',
        },
      },
    }

    render(<TaskActivityDetails data={mockApiTask} />)

    expect(screen.getByText('API Task')).toBeInTheDocument()
    expect(screen.getByText('REST Api')).toBeInTheDocument()
    expect(screen.getByText('GET')).toBeInTheDocument()
    expect(screen.getByText('https://api.example.com')).toBeInTheDocument()
  })

  it('renders connector task details correctly without crashing', () => {
    const mockConnectorTask: TaskActivity = {
      type: 'task',
      id: 'task-3',
      name: 'Connector Task',
      task: {
        executor: 'connector',
        config: {
          connectorId: 'generic-connector-1',
          operation: 'run_action',
          parameters: {
            action: 'process',
          },
        },
      },
    }

    render(<TaskActivityDetails data={mockConnectorTask} />)

    expect(screen.getByText('Connector Task')).toBeInTheDocument()
    // "Connector" appears twice: once as the task type subtitle, and once as the "Connector" ID label
    const connectorElements = screen.getAllByText('Connector')
    expect(connectorElements).toHaveLength(2)
    expect(screen.getByText('generic-connector-1')).toBeInTheDocument()
    expect(screen.getByText('run_action')).toBeInTheDocument()
  })

  it('renders agentic task details correctly', () => {
    const mockAgenticTask: TaskActivity = {
      type: 'task',
      id: 'task-4',
      name: 'AI Agent Task',
      task: {
        executor: 'agentic',
        config: {
          agent: '',
          model: 'claude-3-sonnet',
          prompt: 'Analyze the data and provide insights',
          tools: ['calculator', 'web_search'],
        },
      },
    }

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
    const mockAAPTask: TaskActivity = {
      type: 'task',
      id: 'task-5',
      name: 'AAP Job',
      task: {
        executor: 'aap_job_template',
        config: {
          jobTemplateId: 123,
          inventory: 456,
        },
      },
    }

    render(<TaskActivityDetails data={mockAAPTask} />)

    expect(screen.getByText('AAP Job')).toBeInTheDocument()
    expect(screen.getByText('Job Template ID')).toBeInTheDocument()
    expect(screen.getByText('123')).toBeInTheDocument()
    expect(screen.getByText('Inventory ID')).toBeInTheDocument()
    expect(screen.getByText('456')).toBeInTheDocument()
  })

  it('renders agentic task with fileIds (agent context)', () => {
    const mockAgenticTaskWithFiles: TaskActivity = {
      type: 'task',
      id: 'task-6',
      name: 'AI Agent with Context',
      task: {
        executor: 'agentic',
        config: {
          agent: '',
          model: 'claude-3-opus',
          prompt: 'Analyze these files',
          tools: ['code_analysis'],
          fileIds: ['file1', 'file2', 'file3'],
        },
      },
    }

    render(<TaskActivityDetails data={mockAgenticTaskWithFiles} />)

    expect(screen.getByText('AI Agent with Context')).toBeInTheDocument()
    expect(screen.getByText('Agent context')).toBeInTheDocument()
    expect(screen.getByText('3 files')).toBeInTheDocument()
  })

  it('renders agentic task with single fileId (singular form)', () => {
    const mockAgenticTaskWithSingleFile: TaskActivity = {
      type: 'task',
      id: 'task-7',
      name: 'AI Agent with Single File',
      task: {
        executor: 'agentic',
        config: {
          agent: '',
          model: 'claude-3-opus',
          prompt: 'Analyze this file',
          tools: [],
          fileIds: ['file1'],
        },
      },
    }

    render(<TaskActivityDetails data={mockAgenticTaskWithSingleFile} />)

    expect(screen.getByText('AI Agent with Single File')).toBeInTheDocument()
    expect(screen.getByText('Agent context')).toBeInTheDocument()
    expect(screen.getByText('1 file')).toBeInTheDocument()
  })

  it('renders disguised connector task (agentic executor with connector data)', () => {
    const mockDisguisedConnectorTask: TaskActivity = {
      type: 'task',
      id: 'task-8',
      name: 'Connector via Workaround',
      task: {
        executor: 'agentic',
        config: {
          agent: '',
          model: '',
          prompt: JSON.stringify({
            __type: 'connector',
            connectorId: 'salesforce',
            operation: 'create_lead',
            parameters: {
              firstName: 'John',
              lastName: 'Doe',
            },
          }),
        },
      },
    }

    render(<TaskActivityDetails data={mockDisguisedConnectorTask} />)

    expect(screen.getByText('Connector via Workaround')).toBeInTheDocument()
    expect(screen.getByText('salesforce')).toBeInTheDocument()
    expect(screen.getByText('create_lead')).toBeInTheDocument()
  })
})
