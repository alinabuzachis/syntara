import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { InputMappingFields } from './InputMappingFields'

describe('InputMappingFields', () => {
  it('renders "Inputs" heading', () => {
    render(<InputMappingFields mappings={[]} onChange={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Inputs' })).toBeInTheDocument()
  })

  it('shows "Add input" button', () => {
    render(<InputMappingFields mappings={[]} onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Add input' })).toBeInTheDocument()
  })

  it('clicking "Add input" adds a key-value row with empty fields', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()
    render(<InputMappingFields mappings={[]} onChange={handleChange} />)

    await user.click(screen.getByRole('button', { name: 'Add input' }))

    expect(handleChange).toHaveBeenCalledWith([expect.objectContaining({ key: '', value: '' })])
  })

  it('can type a key name in the key field', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()
    render(<InputMappingFields mappings={[{ id: 'm1', key: '', value: '' }]} onChange={handleChange} />)

    const keyInput = screen.getByPlaceholderText('Name')
    await user.type(keyInput, 'd')

    expect(handleChange).toHaveBeenCalledWith([{ id: 'm1', key: 'd', value: '' }])
  })

  it('can type an expression value in the value field', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()
    render(<InputMappingFields mappings={[{ id: 'm1', key: 'data', value: '' }]} onChange={handleChange} />)

    const valueInput = screen.getByPlaceholderText('Enter or drag and drop value')
    await user.type(valueInput, 'v')

    expect(handleChange).toHaveBeenCalledWith([{ id: 'm1', key: 'data', value: 'v' }])
  })

  it('clicking remove button removes the row', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()
    render(
      <InputMappingFields
        mappings={[
          { id: 'm1', key: 'first', value: 'val1' },
          { id: 'm2', key: 'second', value: 'val2' },
        ]}
        onChange={handleChange}
      />
    )

    const removeButtons = screen.getAllByRole('button', { name: /Remove input/i })
    await user.click(removeButtons[0])

    expect(handleChange).toHaveBeenCalledWith([{ id: 'm2', key: 'second', value: 'val2' }])
  })

  it('renders with existing mappings from initialData prop', () => {
    render(
      <InputMappingFields
        mappings={[
          { id: 'm1', key: 'hostname', value: '${step_1_gather_info.stdout_json.hostname}' },
          { id: 'm2', key: 'config', value: 'static-value' },
        ]}
        onChange={vi.fn()}
      />
    )

    const keyInputs = screen.getAllByPlaceholderText('Name')
    expect(keyInputs).toHaveLength(2)
    expect(keyInputs[0]).toHaveValue('hostname')
    expect(keyInputs[1]).toHaveValue('config')

    const valueInputs = screen.getAllByPlaceholderText('Enter or drag and drop value')
    expect(valueInputs).toHaveLength(2)
    expect(valueInputs[0]).toHaveValue('${step_1_gather_info.stdout_json.hostname}')
    expect(valueInputs[1]).toHaveValue('static-value')
  })

  it('calls onChange with updated mappings when a field changes', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()
    render(
      <InputMappingFields
        mappings={[
          { id: 'm1', key: 'data', value: 'old' },
          { id: 'm2', key: 'config', value: 'keep' },
        ]}
        onChange={handleChange}
      />
    )

    const valueInputs = screen.getAllByPlaceholderText('Enter or drag and drop value')
    await user.clear(valueInputs[0])

    // After clearing, onChange should be called with the first value cleared
    expect(handleChange).toHaveBeenCalledWith([
      { id: 'm1', key: 'data', value: '' },
      { id: 'm2', key: 'config', value: 'keep' },
    ])
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <InputMappingFields mappings={[{ id: 'm1', key: 'data', value: '${step_1.stdout}' }]} onChange={vi.fn()} />
    )

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
