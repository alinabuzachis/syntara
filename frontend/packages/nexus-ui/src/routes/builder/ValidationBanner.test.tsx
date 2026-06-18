import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import type { ValidationError } from './builderReducer'
import {
  humanizeValidationMessage,
  mergeHumanizedMessages,
  parseValidationMessage,
} from './utils/validation/parseValidationMessage'
import { ValidationBanner } from './ValidationBanner'

async function expandAlert() {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: /danger alert details/i }))
  return user
}

describe('parseValidationMessage', () => {
  it('extracts dotted path as key and single error from "key: message" format', () => {
    const result = parseValidationMessage("edges.0.to: '123_bad_id' does not match '^[a-zA-Z_][a-zA-Z0-9_]*$'")

    expect(result.key).toBe('edges.0.to')
    expect(result.displayKey).toBe('edges.0.to')
    expect(result.messages).toEqual(["'123_bad_id' does not match '^[a-zA-Z_][a-zA-Z0-9_]*$'"])
  })

  it('uses dotted path as key and node name as displayKey from "key: ..., errors:[...]" format', () => {
    const result = parseValidationMessage(
      "nodes.0: {'id': '123_bad_id', 'type': 'script', 'name': 'Bad ID', 'parameters': {}}, errors:['123_bad_id' does not match '^[a-zA-Z_][a-zA-Z0-9_]*$', 'approval' was expected]"
    )

    expect(result.key).toBe('nodes.0')
    expect(result.displayKey).toBe('Bad ID')
    expect(result.messages).toEqual([
      "'123_bad_id' does not match '^[a-zA-Z_][a-zA-Z0-9_]*$'",
      "'approval' was expected",
    ])
  })

  it('falls back to dotted path for both key and displayKey when no name is present', () => {
    const result = parseValidationMessage("nodes.0: {'id': 'abc'}, errors:['some error']")

    expect(result.key).toBe('nodes.0')
    expect(result.displayKey).toBe('nodes.0')
    expect(result.messages).toEqual(["'some error'"])
  })

  it('falls back to "Workflow" for both key and displayKey for plain messages', () => {
    const result = parseValidationMessage('Workflow must have at least one trigger')

    expect(result.key).toBe('Workflow')
    expect(result.displayKey).toBe('Workflow')
    expect(result.messages).toEqual(['Workflow must have at least one trigger'])
  })

  it('splits errors that do not start with a single quote', () => {
    const result = parseValidationMessage(
      "nodes.0: {'id': 'abc', 'name': 'My Node'}, errors:['bad id', Missing required field]"
    )

    expect(result.key).toBe('nodes.0')
    expect(result.displayKey).toBe('My Node')
    expect(result.messages).toEqual(["'bad id'", 'Missing required field'])
  })
})

describe('humanizeValidationMessage', () => {
  it('translates regex match errors into plain language', () => {
    const result = humanizeValidationMessage("'123_bad_id' does not match '^[a-zA-Z_][a-zA-Z0-9_]*$'")

    expect(result).toBe(
      '"123_bad_id" is not a valid ID. Use letters, numbers, and underscores only (e.g., "my_node_1")'
    )
  })

  it('translates required property errors into plain language', () => {
    const result = humanizeValidationMessage("'language' is a required property")

    expect(result).toBe('Missing required field "language"')
  })

  it('passes through unrecognized messages unchanged', () => {
    const result = humanizeValidationMessage("'approval' was expected")

    expect(result).toBe("'approval' was expected")
  })
})

describe('mergeHumanizedMessages', () => {
  it('merges two "Missing required field" messages with "and"', () => {
    const result = mergeHumanizedMessages(['Missing required field "language"', 'Missing required field "code"'])

    expect(result).toEqual(['Missing required fields "language" and "code"'])
  })

  it('merges three or more with Oxford comma', () => {
    const result = mergeHumanizedMessages([
      'Missing required field "language"',
      'Missing required field "code"',
      'Missing required field "name"',
    ])

    expect(result).toEqual(['Missing required fields "language", "code", and "name"'])
  })

  it('keeps a single "Missing required field" unchanged', () => {
    const result = mergeHumanizedMessages(['Missing required field "language"'])

    expect(result).toEqual(['Missing required field "language"'])
  })

  it('preserves non-matching messages and puts merged fields first', () => {
    const result = mergeHumanizedMessages([
      'Missing required field "language"',
      '"bad_id" is not a valid ID. Use letters, numbers, and underscores only (e.g., "my_node_1")',
      'Missing required field "code"',
    ])

    expect(result).toEqual([
      'Missing required fields "language" and "code"',
      '"bad_id" is not a valid ID. Use letters, numbers, and underscores only (e.g., "my_node_1")',
    ])
  })
})

describe('ValidationBanner', () => {
  const mockDispatch = vi.fn()

  it('renders nothing when errors is empty', () => {
    const { container } = render(<ValidationBanner errors={[]} dispatch={mockDispatch} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders alert with error count and list items', async () => {
    const errors: ValidationError[] = [
      { message: 'Node A is disconnected', nodeId: 'node-1' },
      { message: 'Missing trigger', nodeId: null },
    ]

    render(<ValidationBanner errors={errors} dispatch={mockDispatch} />)
    await expandAlert()

    expect(screen.getByText('Verification failed — 2 issues found')).toBeInTheDocument()
  })

  it('uses singular "issue" for a single error', async () => {
    const errors: ValidationError[] = [{ message: 'Node A is disconnected', nodeId: 'node-1' }]

    render(<ValidationBanner errors={errors} dispatch={mockDispatch} />)
    await expandAlert()

    expect(screen.getByText('Verification failed — 1 issue found')).toBeInTheDocument()
  })

  it('dispatches CLEAR_VALIDATION_ERRORS when close button is clicked', async () => {
    const errors: ValidationError[] = [{ message: 'Some error', nodeId: null }]

    render(<ValidationBanner errors={errors} dispatch={mockDispatch} />)
    const user = await expandAlert()

    await user.click(screen.getByRole('button', { name: /close/i }))

    expect(mockDispatch).toHaveBeenCalledWith({ type: 'CLEAR_VALIDATION_ERRORS' })
  })

  it('renders node name as clickable term in description list', async () => {
    const onNavigateToNode = vi.fn()
    const errors: ValidationError[] = [{ message: 'MyNode: is disconnected', nodeId: 'node-1', nodeName: 'MyNode' }]

    render(<ValidationBanner errors={errors} dispatch={mockDispatch} onNavigateToNode={onNavigateToNode} />)
    await expandAlert()

    expect(screen.getByRole('button', { name: 'MyNode' })).toBeInTheDocument()
    expect(screen.getByText('is disconnected')).toBeInTheDocument()
  })

  it('calls onNavigateToNode when node term link is clicked', async () => {
    const onNavigateToNode = vi.fn()
    const errors: ValidationError[] = [{ message: 'MyNode: is disconnected', nodeId: 'node-1', nodeName: 'MyNode' }]

    render(<ValidationBanner errors={errors} dispatch={mockDispatch} onNavigateToNode={onNavigateToNode} />)
    const user = await expandAlert()

    await user.click(screen.getByRole('button', { name: 'MyNode' }))

    expect(onNavigateToNode).toHaveBeenCalledWith('node-1')
  })

  it('groups plain errors under Workflow without a link', async () => {
    const onNavigateToNode = vi.fn()
    const errors: ValidationError[] = [
      { message: 'Missing trigger', nodeId: null },
      { message: 'Some raw error', nodeId: null },
    ]

    render(<ValidationBanner errors={errors} dispatch={mockDispatch} onNavigateToNode={onNavigateToNode} />)
    await expandAlert()

    expect(screen.getByText('Workflow')).toBeInTheDocument()
    expect(screen.getByText('Missing trigger')).toBeInTheDocument()
    expect(screen.getByText('Some raw error')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Workflow' })).not.toBeInTheDocument()
  })

  it('renders terms as plain text when onNavigateToNode is not provided', async () => {
    const errors: ValidationError[] = [
      { message: 'MyNode: is disconnected', nodeId: 'node-1', nodeName: 'MyNode' },
      { message: 'Missing trigger', nodeId: null },
    ]

    render(<ValidationBanner errors={errors} dispatch={mockDispatch} />)
    await expandAlert()

    expect(screen.getByText('MyNode')).toBeInTheDocument()
    expect(screen.getByText('is disconnected')).toBeInTheDocument()
    expect(screen.getByText('Workflow')).toBeInTheDocument()
    expect(screen.getByText('Missing trigger')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'MyNode' })).not.toBeInTheDocument()
  })

  it('humanizes and merges structured backend errors with node name term', async () => {
    const onNavigateToNode = vi.fn()
    const errors: ValidationError[] = [
      {
        message:
          "nodes.2: {'id': 'activity_abc', 'type': 'script', 'name': 'Script5'}, errors:['language' is a required property, 'code' is a required property]",
        nodeId: 'node-2',
        nodeName: 'Script5',
      },
    ]

    render(<ValidationBanner errors={errors} dispatch={mockDispatch} onNavigateToNode={onNavigateToNode} />)
    await expandAlert()

    expect(screen.getByRole('button', { name: 'Script5' })).toBeInTheDocument()
    expect(screen.getByText('Missing required fields "language" and "code"')).toBeInTheDocument()
  })

  it('humanizes simple prefixed errors with node name term', async () => {
    const onNavigateToNode = vi.fn()
    const errors: ValidationError[] = [
      { message: "Script4: 'language' is a required property", nodeId: 'node-1', nodeName: 'Script4' },
    ]

    render(<ValidationBanner errors={errors} dispatch={mockDispatch} onNavigateToNode={onNavigateToNode} />)
    await expandAlert()

    expect(screen.getByRole('button', { name: 'Script4' })).toBeInTheDocument()
    expect(screen.getByText('Missing required field "language"')).toBeInTheDocument()
  })

  it('stacks multiple errors vertically under the same node', async () => {
    const onNavigateToNode = vi.fn()
    const errors: ValidationError[] = [
      {
        message:
          "nodes.0: {'id': 'abc', 'type': 'script', 'name': 'Bad ID'}, errors:['123_bad_id' does not match '^[a-zA-Z_][a-zA-Z0-9_]*$', 'approval' was expected]",
        nodeId: 'node-0',
        nodeName: 'Bad ID',
      },
    ]

    render(<ValidationBanner errors={errors} dispatch={mockDispatch} onNavigateToNode={onNavigateToNode} />)
    await expandAlert()

    expect(screen.getByRole('button', { name: 'Bad ID' })).toBeInTheDocument()
    expect(
      screen.getByText('"123_bad_id" is not a valid ID. Use letters, numbers, and underscores only (e.g., "my_node_1")')
    ).toBeInTheDocument()
    expect(screen.getByText("'approval' was expected")).toBeInTheDocument()
  })

  it('humanizes regex errors under Workflow term when no nodeId', async () => {
    const errors: ValidationError[] = [
      { message: "'123_bad_id' does not match '^[a-zA-Z_][a-zA-Z0-9_]*$'", nodeId: null },
    ]

    render(<ValidationBanner errors={errors} dispatch={mockDispatch} />)
    await expandAlert()

    expect(screen.getByText('Workflow')).toBeInTheDocument()
    expect(
      screen.getByText('"123_bad_id" is not a valid ID. Use letters, numbers, and underscores only (e.g., "my_node_1")')
    ).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const onNavigateToNode = vi.fn()
    const errors: ValidationError[] = [
      { message: 'MyNode: is disconnected', nodeId: 'node-1', nodeName: 'MyNode' },
      { message: 'Missing trigger', nodeId: null },
    ]

    const { container } = render(
      <ValidationBanner errors={errors} dispatch={mockDispatch} onNavigateToNode={onNavigateToNode} />
    )
    await expandAlert()

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
