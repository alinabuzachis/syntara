import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ErrorState } from './ErrorState'

// Mock the apiErrors utilities
vi.mock('../../utils/apiErrors', () => ({
  getErrorMessage: (error: unknown) => {
    if (typeof error === 'string') return error
    if (error && typeof error === 'object' && 'message' in error) return (error as { message: string }).message
    return 'Unknown error'
  },
  getErrorTitle: (error: unknown) => {
    if (error && typeof error === 'object' && 'title' in error) return (error as { title: string }).title
    return 'Error'
  },
  isRetryableError: (error: unknown) => {
    if (error && typeof error === 'object' && 'retryable' in error) return (error as { retryable: boolean }).retryable
    return false
  },
  isServiceUnavailableError: (error: unknown) => {
    if (error && typeof error === 'object' && 'status' in error) return (error as { status: number }).status === 503
    return false
  },
}))

describe('ErrorState', () => {
  it('renders with error message string', () => {
    render(<ErrorState message="Something went wrong" />)

    expect(screen.getByTestId('error-state')).toBeInTheDocument()
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('renders with custom title', () => {
    render(<ErrorState title="Custom Error Title" message="Error details" />)

    expect(screen.getByText('Custom Error Title')).toBeInTheDocument()
    expect(screen.getByText('Error details')).toBeInTheDocument()
  })

  it('renders with error object', () => {
    const error = { message: 'API failed', title: 'API Error' }
    render(<ErrorState message={error} />)

    expect(screen.getByText('API Error')).toBeInTheDocument()
    expect(screen.getByText('API failed')).toBeInTheDocument()
  })

  it('does not show retry button for non-retryable errors', () => {
    const onRetry = vi.fn()
    render(<ErrorState message="Non-retryable error" onRetry={onRetry} />)

    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
  })

  it('shows retry button for retryable errors when onRetry provided', () => {
    const onRetry = vi.fn()
    const error = { message: 'Retryable error', retryable: true }
    render(<ErrorState message={error} onRetry={onRetry} />)

    const retryButton = screen.getByRole('button', { name: 'Retry' })
    expect(retryButton).toBeInTheDocument()
  })

  it('calls onRetry when retry button is clicked', () => {
    const onRetry = vi.fn()
    const error = { message: 'Retryable error', retryable: true }
    render(<ErrorState message={error} onRetry={onRetry} />)

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders EmptyStateServiceUnavailable for 503 errors', () => {
    const error = { message: 'Service unavailable', status: 503 }
    render(<ErrorState message={error} />)

    // Should render EmptyStateServiceUnavailable instead
    expect(screen.getByText('Service Unavailable')).toBeInTheDocument()
  })

  it('does not show retry button when onRetry is not provided', () => {
    const error = { message: 'Retryable error', retryable: true }
    render(<ErrorState message={error} />)

    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
  })
})
