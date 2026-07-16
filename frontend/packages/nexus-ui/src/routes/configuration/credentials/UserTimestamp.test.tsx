import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { UserTimestamp } from './UserTimestamp'

const userRef = { id: '550e8400-e29b-41d4-a716-446655440001', name: 'alice' }
const timestamp = '2026-07-01T12:00:00Z'

describe('UserTimestamp', () => {
  describe('resolves display name from different user types', () => {
    it('renders username from a UserReference object', () => {
      render(<UserTimestamp user={userRef} timestamp={timestamp} />)
      expect(screen.getByText('alice')).toBeInTheDocument()
    })

    it('renders username from a plain string', () => {
      render(<UserTimestamp user="bob" timestamp={timestamp} />)
      expect(screen.getByText('bob')).toBeInTheDocument()
    })

    it('renders only timestamp when user is null', () => {
      const { container } = render(<UserTimestamp user={null} timestamp={timestamp} />)
      expect(container.textContent).not.toContain('alice')
      expect(container.textContent).toContain('Jul')
    })

    it('renders only timestamp when user is undefined', () => {
      const { container } = render(<UserTimestamp timestamp={timestamp} />)
      expect(container.textContent).toContain('Jul')
    })
  })

  describe('stacked mode (default)', () => {
    it('renders user and timestamp on separate lines', () => {
      render(<UserTimestamp user={userRef} timestamp={timestamp} />)
      expect(screen.getByText('alice')).toBeInTheDocument()
    })

    it('renders with UserReference in stacked mode', () => {
      render(<UserTimestamp user={userRef} timestamp={timestamp} subtleTimestamp={false} />)
      expect(screen.getByText('alice')).toBeInTheDocument()
    })

    it('renders without user in stacked mode', () => {
      render(<UserTimestamp timestamp={timestamp} />)
      expect(screen.getByText(/Jul/)).toBeInTheDocument()
    })
  })

  describe('inline mode', () => {
    it('renders user and timestamp on one line with separator', () => {
      const { container } = render(<UserTimestamp user={userRef} timestamp={timestamp} inline />)
      expect(screen.getByText('alice')).toBeInTheDocument()
      expect(container.textContent).toContain('·')
    })

    it('renders UserReference object inline', () => {
      render(<UserTimestamp user={userRef} timestamp={timestamp} inline />)
      expect(screen.getByText('alice')).toBeInTheDocument()
    })

    it('renders plain string user inline', () => {
      render(<UserTimestamp user="charlie" timestamp={timestamp} inline />)
      expect(screen.getByText('charlie')).toBeInTheDocument()
    })

    it('renders only timestamp inline when user is null', () => {
      const { container } = render(<UserTimestamp user={null} timestamp={timestamp} inline />)
      expect(container.textContent).not.toContain('·')
    })

    it('applies neutral timestamp color when subtleTimestamp is false', () => {
      render(<UserTimestamp user={userRef} timestamp={timestamp} inline subtleTimestamp={false} />)
      expect(screen.getByText('alice')).toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('has no a11y violations in stacked mode', async () => {
      const { container } = render(<UserTimestamp user={userRef} timestamp={timestamp} />)
      expect(await axe(container)).toHaveNoViolations()
    })

    it('has no a11y violations in inline mode', async () => {
      const { container } = render(<UserTimestamp user={userRef} timestamp={timestamp} inline />)
      expect(await axe(container)).toHaveNoViolations()
    })
  })
})
