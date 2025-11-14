import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { FileIcon } from 'lucide-react'
import { SelectableCardWithForm } from './SelectableCardWithForm'

describe('SelectableCardWithForm', () => {
  it('renders the card with label', () => {
    render(<SelectableCardWithForm icon={FileIcon} label="Test Label" />)
    expect(screen.getByText('Test Label')).toBeInTheDocument()
  })

  it('does not show form when not selected', () => {
    render(
      <SelectableCardWithForm icon={FileIcon} label="Test Label" isSelected={false} form={<div>Form Content</div>} />
    )
    expect(screen.queryByText('Form Content')).not.toBeInTheDocument()
  })

  it('shows form when selected', () => {
    render(
      <SelectableCardWithForm icon={FileIcon} label="Test Label" isSelected={true} form={<div>Form Content</div>} />
    )
    expect(screen.getByText('Form Content')).toBeInTheDocument()
  })

  it('does not show form when selected but form is not provided', () => {
    render(<SelectableCardWithForm icon={FileIcon} label="Test Label" isSelected={true} />)
    expect(screen.queryByText('Form Content')).not.toBeInTheDocument()
  })

  it('calls onClick when card is clicked', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()
    render(<SelectableCardWithForm icon={FileIcon} label="Test Label" onClick={handleClick} />)

    const button = screen.getByRole('button')
    await user.click(button)

    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('applies formClassName to form container', () => {
    const { container } = render(
      <SelectableCardWithForm
        icon={FileIcon}
        label="Test Label"
        isSelected={true}
        form={<div>Form Content</div>}
        formClassName="custom-form-class"
      />
    )
    const formContainer = container.querySelector('.custom-form-class')
    expect(formContainer).toBeInTheDocument()
  })
})
