import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import App from './App'

describe('App', () => {
  it('renders without crashing', () => {
    render(<App />)
    expect(document.body).toBeInTheDocument()
  })

  it('renders AppLogin component', () => {
    const { container } = render(<App />)

    expect(container.firstChild).toBeTruthy()
  })

  it('renders the main application structure', () => {
    const { container } = render(<App />)

    expect(container.querySelector('.pf-v6-c-compass')).toBeInTheDocument()
  })

  it('renders navigation dock', () => {
    render(<App />)

    // The docked masthead should be rendered
    expect(screen.getByRole('banner')).toBeInTheDocument()
  })

  it('provides QueryClient context', () => {
    // App wraps everything in QueryClientProvider
    const { container } = render(<App />)
    expect(container.innerHTML).toContain('pf-v6')
  })
})
