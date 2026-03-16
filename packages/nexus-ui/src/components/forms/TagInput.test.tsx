import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { TagInput } from './TagInput'

describe('TagInput', () => {
  it('renders placeholder when value is empty', () => {
    render(<TagInput id="tag-input" value={[]} onChange={vi.fn()} ariaLabel="Add item" placeholder="Enter item" />)
    expect(screen.getByPlaceholderText('Enter item')).toBeInTheDocument()
  })

  it('adds item on Enter key', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TagInput id="tag-input" value={[]} onChange={onChange} ariaLabel="Add item" placeholder="Enter item" />)
    await user.type(screen.getByLabelText('Add item'), 'tag1{Enter}')
    expect(onChange).toHaveBeenCalledWith(['tag1'])
  })

  it('adds item on comma key', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TagInput id="tag-input" value={[]} onChange={onChange} ariaLabel="Add item" />)
    await user.type(screen.getByLabelText('Add item'), 'tag2,')
    expect(onChange).toHaveBeenCalledWith(['tag2'])
  })

  it('calls onChange with item removed when chip close is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TagInput id="tag-input" value={['deploy', 'prod']} onChange={onChange} ariaLabel="Add item" />)
    await user.click(screen.getByLabelText('Remove deploy'))
    expect(onChange).toHaveBeenCalledWith(['prod'])
  })

  it('preserves spaces in token when typing and pressing Enter', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TagInput id="tag-input" value={[]} onChange={onChange} ariaLabel="Add item" />)
    await user.type(screen.getByLabelText('Add item'), 'two words{Enter}')
    expect(onChange).toHaveBeenCalledWith(['two words'])
  })
})
