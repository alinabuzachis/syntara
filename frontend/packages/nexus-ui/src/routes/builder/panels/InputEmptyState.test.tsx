import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { InputEmptyState } from './InputEmptyState'

describe('InputEmptyState', () => {
  describe('not-connected variant', () => {
    it('renders the correct message text', () => {
      render(<InputEmptyState variant="not-connected" />)

      expect(screen.getByText('Input data can only be displayed when a step is connected and run')).toBeInTheDocument()
    })

    it('has no accessibility violations', async () => {
      const { container } = render(<InputEmptyState variant="not-connected" />)

      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })
  })

  describe('connected-not-run variant', () => {
    it('renders the correct message text', () => {
      render(<InputEmptyState variant="connected-not-run" />)

      expect(screen.getByText('Run previous step to populate input')).toBeInTheDocument()
    })

    it('has no accessibility violations', async () => {
      const { container } = render(<InputEmptyState variant="connected-not-run" />)

      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })
  })
})
