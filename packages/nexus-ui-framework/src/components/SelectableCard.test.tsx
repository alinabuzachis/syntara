import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { FileIcon } from 'lucide-react'
import { SelectableCard } from './SelectableCard'

describe('SelectableCard', () => {
  it('renders with label and icon', () => {
    render(<SelectableCard icon={FileIcon} label="Test Label" />)
    expect(screen.getByRole('button')).toBeInTheDocument()
    expect(screen.getByText('Test Label')).toBeInTheDocument()
  })

  it('renders with description when provided', () => {
    render(<SelectableCard icon={FileIcon} label="Test Label" description="Test description" />)
    expect(screen.getByText('Test description')).toBeInTheDocument()
  })

  it('does not render description when not provided', () => {
    render(<SelectableCard icon={FileIcon} label="Test Label" />)
    expect(screen.queryByText('Test description')).not.toBeInTheDocument()
  })

  it('applies selected styles when isSelected is true', () => {
    render(<SelectableCard icon={FileIcon} label="Test Label" isSelected={true} />)
    const button = screen.getByRole('button')
    expect(button).toHaveClass('border-blue-400/70', 'bg-blue-400/10')
  })

  it('applies hover styles when isSelected is false', () => {
    render(<SelectableCard icon={FileIcon} label="Test Label" isSelected={false} />)
    const button = screen.getByRole('button')
    expect(button).toHaveClass('hover:border-blue-400/50', 'hover:bg-white/5')
  })

  it('calls onClick handler when clicked', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()
    render(<SelectableCard icon={FileIcon} label="Test Label" onClick={handleClick} />)

    const button = screen.getByRole('button')
    await user.click(button)

    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('sets title attribute when provided', () => {
    render(<SelectableCard icon={FileIcon} label="Test Label" title="Tooltip text" />)
    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('title', 'Tooltip text')
  })

  it('applies custom className when provided', () => {
    render(<SelectableCard icon={FileIcon} label="Test Label" className="custom-class" />)
    const button = screen.getByRole('button')
    expect(button).toHaveClass('custom-class')
  })
})
