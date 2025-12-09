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
    expect(screen.getByText('python')).toBeInTheDocument()
    expect(screen.getByText('print("hello")')).toBeInTheDocument()
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
          connectorId: 'ansible-1',
          operation: 'run_playbook',
          parameters: {
            playbook: 'site.yml',
          },
        },
      },
    }

    render(<TaskActivityDetails data={mockConnectorTask} />)

    expect(screen.getByText('Connector Task')).toBeInTheDocument()
    // "Connector" appears twice: once as the task type subtitle, and once as the "Connector" ID label
    const connectorElements = screen.getAllByText('Connector')
    expect(connectorElements).toHaveLength(2)
    expect(screen.getByText('ansible-1')).toBeInTheDocument()
    expect(screen.getByText('run_playbook')).toBeInTheDocument()
  })
})
