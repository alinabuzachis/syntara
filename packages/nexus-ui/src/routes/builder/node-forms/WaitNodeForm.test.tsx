import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { renderWithHeader } from './test-utils/renderWithHeader'
import { WaitNodeForm, type WaitFormData } from './WaitNodeForm'

vi.mock('./useMaxWaitDuration', () => ({
  useMaxWaitDuration: () => ({ maxSeconds: 2_592_000, isLoading: false }),
}))

describe('WaitNodeForm', () => {
  const mockOnSubmit = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('renders name field', () => {
      renderWithHeader(<WaitNodeForm onSubmit={mockOnSubmit} />)

      expect(screen.getByPlaceholderText(/Enter activity name/i)).toBeInTheDocument()
    })

    it('renders duration fields', () => {
      renderWithHeader(<WaitNodeForm onSubmit={mockOnSubmit} />)

      expect(screen.getByRole('spinbutton', { name: /Days/i })).toBeInTheDocument()
      expect(screen.getByRole('spinbutton', { name: /Hours/i })).toBeInTheDocument()
      expect(screen.getByRole('spinbutton', { name: /Minutes/i })).toBeInTheDocument()
      expect(screen.getByRole('spinbutton', { name: /Seconds/i })).toBeInTheDocument()
    })

    it('renders duration labels', () => {
      renderWithHeader(<WaitNodeForm onSubmit={mockOnSubmit} />)

      expect(screen.getByText('Days')).toBeInTheDocument()
      expect(screen.getByText('Hours')).toBeInTheDocument()
      expect(screen.getByText('Minutes')).toBeInTheDocument()
      expect(screen.getByText('Seconds')).toBeInTheDocument()
    })

    it('renders "Wait duration" label', () => {
      renderWithHeader(<WaitNodeForm onSubmit={mockOnSubmit} />)

      expect(screen.getByText('Wait duration')).toBeInTheDocument()
    })
  })

  describe('Initial Data', () => {
    it('pre-populates form with initialData', () => {
      const initialData: Partial<WaitFormData> = {
        name: 'Existing Wait',
        days: 1,
        hours: 2,
        minutes: 30,
        seconds: 0,
      }

      renderWithHeader(<WaitNodeForm onSubmit={mockOnSubmit} initialData={initialData} />)

      expect(screen.getByPlaceholderText(/Enter activity name/i)).toHaveValue('Existing Wait')
      expect(screen.getByRole('spinbutton', { name: /Days/i })).toHaveValue(1)
      expect(screen.getByRole('spinbutton', { name: /Hours/i })).toHaveValue(2)
      expect(screen.getByRole('spinbutton', { name: /Minutes/i })).toHaveValue(30)
      expect(screen.getByRole('spinbutton', { name: /Seconds/i })).toHaveValue(0)
    })

    it('defaults to zero values when no initialData provided', () => {
      renderWithHeader(<WaitNodeForm onSubmit={mockOnSubmit} />)

      expect(screen.getByRole('spinbutton', { name: /Days/i })).toHaveValue(0)
      expect(screen.getByRole('spinbutton', { name: /Hours/i })).toHaveValue(0)
      expect(screen.getByRole('spinbutton', { name: /Minutes/i })).toHaveValue(0)
      expect(screen.getByRole('spinbutton', { name: /Seconds/i })).toHaveValue(0)
    })
  })

  describe('Validation', () => {
    it('does not submit when total duration is zero', async () => {
      render(<WaitNodeForm onSubmit={mockOnSubmit} initialData={{ name: 'Test Wait' }} />)

      fireEvent.submit(screen.getByTestId('wait-node-form'))

      await waitFor(() => {
        expect(mockOnSubmit).not.toHaveBeenCalled()
      })
    })

    it('does not submit when total duration exceeds max', async () => {
      const initialData: Partial<WaitFormData> = {
        name: 'Too Long',
        days: 31,
        hours: 0,
        minutes: 0,
        seconds: 0,
      }

      render(<WaitNodeForm onSubmit={mockOnSubmit} initialData={initialData} />)

      fireEvent.submit(screen.getByTestId('wait-node-form'))

      await waitFor(() => {
        expect(mockOnSubmit).not.toHaveBeenCalled()
      })
    })
  })

  describe('Form Submission', () => {
    it('submits valid duration data', async () => {
      const initialData: Partial<WaitFormData> = {
        name: 'My Wait',
        days: 0,
        hours: 1,
        minutes: 30,
        seconds: 0,
      }

      render(<WaitNodeForm onSubmit={mockOnSubmit} initialData={initialData} />)

      fireEvent.submit(screen.getByTestId('wait-node-form'))

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalled()
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vi.mock returns untyped mock calls
        const calledWith: WaitFormData = mockOnSubmit.mock.calls[0][0]
        expect(calledWith.name).toBe('My Wait')
        expect(calledWith.hours).toBe(1)
        expect(calledWith.minutes).toBe(30)
      })
    })
  })

  describe('Header Content', () => {
    it('calls onHeaderContentChange with name field', () => {
      const mockOnHeaderContentChange = vi.fn()
      render(<WaitNodeForm onSubmit={mockOnSubmit} onHeaderContentChange={mockOnHeaderContentChange} />)

      expect(mockOnHeaderContentChange).toHaveBeenCalledWith(expect.anything())
    })

    it('cleans up header content on unmount', () => {
      const mockOnHeaderContentChange = vi.fn()
      const { unmount } = render(
        <WaitNodeForm onSubmit={mockOnSubmit} onHeaderContentChange={mockOnHeaderContentChange} />
      )

      mockOnHeaderContentChange.mockClear()
      unmount()

      expect(mockOnHeaderContentChange).toHaveBeenCalledWith(null)
    })
  })

  describe('Accessibility', () => {
    it('has no accessibility violations', async () => {
      const { container } = renderWithHeader(<WaitNodeForm onSubmit={mockOnSubmit} />)

      const results = await axe(container, { rules: { 'aria-valid-attr-value': { enabled: false } } })

      expect(results).toHaveNoViolations()
    })
  })
})
