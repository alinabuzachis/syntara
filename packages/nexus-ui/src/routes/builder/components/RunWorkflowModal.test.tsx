import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { ColorSchemeProvider } from '../../../theme/ColorSchemeProvider'

import { RunWorkflowModal } from './RunWorkflowModal'

// Captures the latest onCodeChange so tests can set editor content directly,
// bypassing the controlled textarea (userEvent.type would append char-by-char
// and fight with React state on a mocked component).
let mockSetCode: ((v: string) => void) | undefined

vi.mock('../../../components/ExpandableCodeEditor', () => ({
  ExpandableCodeEditor: ({
    code,
    onCodeChange,
    ariaLabel,
  }: {
    code: string
    onCodeChange: (v: string) => void
    ariaLabel?: string
    additionalControls?: React.ReactNode
  }) => {
    mockSetCode = onCodeChange
    return <textarea data-testid="mock-code-editor" aria-label={ariaLabel} value={code} readOnly />
  },
}))

vi.mock('../../../components/JsonEditorToolbar', () => ({
  JsonEditorControls: () => null,
}))

const mockShowError = vi.fn()
vi.mock('../../../components/alerts', () => ({
  useAlerts: () => ({ showError: mockShowError, showSuccess: vi.fn() }),
}))

function renderModal(overrides: Partial<React.ComponentProps<typeof RunWorkflowModal>> = {}) {
  const props: React.ComponentProps<typeof RunWorkflowModal> = {
    isOpen: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    workflowName: 'my-workflow',
    triggerName: 'Manual Trigger',
    ...overrides,
  }
  return {
    ...render(
      <ColorSchemeProvider>
        <RunWorkflowModal {...props} />
      </ColorSchemeProvider>
    ),
    props,
  }
}

describe('RunWorkflowModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not render modal content when isOpen is false', () => {
    renderModal({ isOpen: false })
    expect(screen.queryByText('Set mock output data for Manual Trigger')).not.toBeInTheDocument()
  })

  it('renders title with trigger name when open', () => {
    renderModal({ triggerName: 'My Trigger' })
    expect(screen.getByText('Set mock output data for My Trigger')).toBeInTheDocument()
  })

  it('renders Run and Cancel buttons', () => {
    renderModal()
    expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup()
    const { props } = renderModal()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onConfirm with parsed JSON when Run is clicked with valid JSON', async () => {
    const user = userEvent.setup()
    const { props } = renderModal()

    act(() => mockSetCode?.('{"host": "server1"}'))
    await user.click(screen.getByRole('button', { name: 'Run' }))

    expect(props.onConfirm).toHaveBeenCalledWith({ host: 'server1' }, undefined)
  })

  it('passes triggerNodeId to onConfirm when provided', async () => {
    const user = userEvent.setup()
    const { props } = renderModal({ triggerNodeId: 'trigger-abc-123' })

    await user.click(screen.getByRole('button', { name: 'Run' }))

    expect(props.onConfirm).toHaveBeenCalledWith({}, 'trigger-abc-123')
  })

  it('shows error when Run is clicked with invalid JSON', async () => {
    const user = userEvent.setup()
    const { props } = renderModal()

    act(() => mockSetCode?.('not valid json'))
    await user.click(screen.getByRole('button', { name: 'Run' }))

    expect(mockShowError).toHaveBeenCalledWith({
      title: 'Invalid JSON',
      description: 'The data must be valid JSON.',
    })
    expect(props.onConfirm).not.toHaveBeenCalled()
  })

  describe('template generation', () => {
    it('generates template from inputSchema properties', () => {
      const inputSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          count: { type: 'number' },
          active: { type: 'boolean' },
        },
      }
      renderModal({ inputSchema })

      const editor: HTMLTextAreaElement = screen.getByTestId('mock-code-editor')
      const parsed = JSON.parse(editor.value) as Record<string, unknown>
      expect(parsed).toEqual({ name: '', count: 0, active: false })
    })

    it('uses default values from schema when present', () => {
      const inputSchema = {
        type: 'object',
        properties: {
          env: { type: 'string', default: 'production' },
        },
      }
      renderModal({ inputSchema })

      const editor: HTMLTextAreaElement = screen.getByTestId('mock-code-editor')
      const parsed = JSON.parse(editor.value) as Record<string, unknown>
      expect(parsed).toEqual({ env: 'production' })
    })

    it('starts with empty object when no inputSchema', () => {
      renderModal()
      const editor: HTMLTextAreaElement = screen.getByTestId('mock-code-editor')
      expect(editor.value).toBe('{}')
    })
  })

  describe('schema validation', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        count: { type: 'number' },
      },
      required: ['name'],
    }

    it('rejects when required field is missing', async () => {
      const user = userEvent.setup()
      const { props } = renderModal({ inputSchema: schema })

      act(() => mockSetCode?.('{"count": 5}'))
      await user.click(screen.getByRole('button', { name: 'Run' }))

      expect(mockShowError).toHaveBeenCalledWith({
        title: 'Validation failed',
        description: expect.stringContaining('Missing required field: "name"') as unknown as string,
      })
      expect(props.onConfirm).not.toHaveBeenCalled()
    })

    it('rejects when field type does not match schema', async () => {
      const user = userEvent.setup()
      const { props } = renderModal({ inputSchema: schema })

      act(() => mockSetCode?.('{"name": 123}'))
      await user.click(screen.getByRole('button', { name: 'Run' }))

      expect(mockShowError).toHaveBeenCalledWith({
        title: 'Validation failed',
        description: expect.stringContaining('Field "name" should be string') as unknown as string,
      })
      expect(props.onConfirm).not.toHaveBeenCalled()
    })

    it('accepts valid data matching schema', async () => {
      const user = userEvent.setup()
      const { props } = renderModal({ inputSchema: schema })

      act(() => mockSetCode?.('{"name": "test", "count": 5}'))
      await user.click(screen.getByRole('button', { name: 'Run' }))

      expect(props.onConfirm).toHaveBeenCalledWith({ name: 'test', count: 5 }, undefined)
      expect(mockShowError).not.toHaveBeenCalled()
    })

    it('accepts integer-typed field with a number value', async () => {
      const user = userEvent.setup()
      const intSchema = {
        type: 'object',
        properties: { qty: { type: 'integer' } },
        required: ['qty'],
      }
      const { props } = renderModal({ inputSchema: intSchema })

      act(() => mockSetCode?.('{"qty": 42}'))
      await user.click(screen.getByRole('button', { name: 'Run' }))

      expect(props.onConfirm).toHaveBeenCalledWith({ qty: 42 }, undefined)
      expect(mockShowError).not.toHaveBeenCalled()
    })

    it('rejects when integer-typed field receives a string', async () => {
      const user = userEvent.setup()
      const intSchema = {
        type: 'object',
        properties: { qty: { type: 'integer' } },
        required: ['qty'],
      }
      const { props } = renderModal({ inputSchema: intSchema })

      act(() => mockSetCode?.('{"qty": "not-a-number"}'))
      await user.click(screen.getByRole('button', { name: 'Run' }))

      expect(mockShowError).toHaveBeenCalledWith({
        title: 'Validation failed',
        description: expect.stringContaining('Field "qty" should be integer') as unknown as string,
      })
      expect(props.onConfirm).not.toHaveBeenCalled()
    })

    it('accepts boolean-typed field with a boolean value', async () => {
      const user = userEvent.setup()
      const boolSchema = {
        type: 'object',
        properties: { enabled: { type: 'boolean' } },
        required: ['enabled'],
      }
      const { props } = renderModal({ inputSchema: boolSchema })

      act(() => mockSetCode?.('{"enabled": true}'))
      await user.click(screen.getByRole('button', { name: 'Run' }))

      expect(props.onConfirm).toHaveBeenCalledWith({ enabled: true }, undefined)
      expect(mockShowError).not.toHaveBeenCalled()
    })

    it('rejects when boolean-typed field receives a string', async () => {
      const user = userEvent.setup()
      const boolSchema = {
        type: 'object',
        properties: { enabled: { type: 'boolean' } },
        required: ['enabled'],
      }
      const { props } = renderModal({ inputSchema: boolSchema })

      act(() => mockSetCode?.('{"enabled": "yes"}'))
      await user.click(screen.getByRole('button', { name: 'Run' }))

      expect(mockShowError).toHaveBeenCalledWith({
        title: 'Validation failed',
        description: expect.stringContaining('Field "enabled" should be boolean') as unknown as string,
      })
      expect(props.onConfirm).not.toHaveBeenCalled()
    })

    it('accepts array-typed field with an array value', async () => {
      const user = userEvent.setup()
      const arraySchema = {
        type: 'object',
        properties: { tags: { type: 'array' } },
        required: ['tags'],
      }
      const { props } = renderModal({ inputSchema: arraySchema })

      act(() => mockSetCode?.('{"tags": ["a", "b"]}'))
      await user.click(screen.getByRole('button', { name: 'Run' }))

      expect(props.onConfirm).toHaveBeenCalledWith({ tags: ['a', 'b'] }, undefined)
      expect(mockShowError).not.toHaveBeenCalled()
    })

    it('rejects when array-typed field receives an object', async () => {
      const user = userEvent.setup()
      const arraySchema = {
        type: 'object',
        properties: { tags: { type: 'array' } },
        required: ['tags'],
      }
      const { props } = renderModal({ inputSchema: arraySchema })

      act(() => mockSetCode?.('{"tags": {"a": 1}}'))
      await user.click(screen.getByRole('button', { name: 'Run' }))

      expect(mockShowError).toHaveBeenCalledWith({
        title: 'Validation failed',
        description: expect.stringContaining('Field "tags" should be array') as unknown as string,
      })
      expect(props.onConfirm).not.toHaveBeenCalled()
    })

    it('accepts object-typed field with a plain object value', async () => {
      const user = userEvent.setup()
      const objSchema = {
        type: 'object',
        properties: { config: { type: 'object' } },
        required: ['config'],
      }
      const { props } = renderModal({ inputSchema: objSchema })

      act(() => mockSetCode?.('{"config": {"key": "value"}}'))
      await user.click(screen.getByRole('button', { name: 'Run' }))

      expect(props.onConfirm).toHaveBeenCalledWith({ config: { key: 'value' } }, undefined)
      expect(mockShowError).not.toHaveBeenCalled()
    })

    it('rejects when object-typed field receives an array', async () => {
      const user = userEvent.setup()
      const objSchema = {
        type: 'object',
        properties: { config: { type: 'object' } },
        required: ['config'],
      }
      const { props } = renderModal({ inputSchema: objSchema })

      act(() => mockSetCode?.('{"config": [1, 2]}'))
      await user.click(screen.getByRole('button', { name: 'Run' }))

      expect(mockShowError).toHaveBeenCalledWith({
        title: 'Validation failed',
        description: expect.stringContaining('Field "config" should be object') as unknown as string,
      })
      expect(props.onConfirm).not.toHaveBeenCalled()
    })

    it('accepts any value when property has no type defined (default permissive)', async () => {
      const user = userEvent.setup()
      const noTypeSchema = {
        type: 'object',
        properties: { anything: {} },
        required: ['anything'],
      }
      const { props } = renderModal({ inputSchema: noTypeSchema })

      act(() => mockSetCode?.('{"anything": 42}'))
      await user.click(screen.getByRole('button', { name: 'Run' }))

      expect(props.onConfirm).toHaveBeenCalledWith({ anything: 42 }, undefined)
      expect(mockShowError).not.toHaveBeenCalled()
    })
  })

  describe('template generation for additional types', () => {
    it('generates integer and boolean template values from schema', () => {
      const inputSchema = {
        type: 'object',
        properties: {
          count: { type: 'integer' },
          enabled: { type: 'boolean' },
          tags: { type: 'array' },
          config: { type: 'object' },
          extra: {},
        },
      }
      renderModal({ inputSchema })

      const editor: HTMLTextAreaElement = screen.getByTestId('mock-code-editor')
      const parsed = JSON.parse(editor.value) as Record<string, unknown>
      expect(parsed.count).toBe(0)
      expect(parsed.enabled).toBe(false)
      expect(parsed.tags).toEqual([])
      expect(parsed.config).toEqual({})
      expect(parsed.extra).toBeNull()
    })

    it('returns empty object template when schema type is not object', () => {
      const inputSchema = { type: 'array', items: { type: 'string' } }
      renderModal({ inputSchema })

      const editor: HTMLTextAreaElement = screen.getByTestId('mock-code-editor')
      expect(editor.value).toBe('{}')
    })
  })

  describe('accessibility', () => {
    it('has no violations when open', async () => {
      const { container } = renderModal()
      expect(await axe(container)).toHaveNoViolations()
    })
  })
})
