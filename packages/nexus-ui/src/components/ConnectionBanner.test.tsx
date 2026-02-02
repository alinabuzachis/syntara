import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ConnectionBanner } from './ConnectionBanner'

describe('ConnectionBanner', () => {
  it('renders nothing when not visible', () => {
    const { container } = render(<ConnectionBanner isVisible={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the banner content when visible', () => {
    render(<ConnectionBanner isVisible />)
    expect(screen.getByText('Live updates paused')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Your automation is still running safely in the background. Refresh the page to see the latest progress.'
      )
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
  })

  it('dismisses when the close button is clicked', async () => {
    const user = userEvent.setup()
    render(<ConnectionBanner isVisible />)

    await user.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByText('Live updates paused')).not.toBeInTheDocument()
  })
})
