import { IntegrationStatusEnum } from '@ansible/nexus-contracts'
import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'

import { StatusLabel } from './StatusLabel'

describe('StatusLabel', () => {
  it('renders available status with success label', () => {
    render(<StatusLabel status={IntegrationStatusEnum.AVAILABLE} />)
    expect(screen.getByText('Available')).toBeInTheDocument()
  })

  it('renders error status with danger label', () => {
    render(<StatusLabel status={IntegrationStatusEnum.ERROR} />)
    expect(screen.getByText('Error')).toBeInTheDocument()
  })

  it('renders validating status', () => {
    render(<StatusLabel status={IntegrationStatusEnum.VALIDATING} />)
    expect(screen.getByText('Validating')).toBeInTheDocument()
  })

  it('renders unknown status with fallback', () => {
    render(<StatusLabel status="unknown" />)
    expect(screen.getByText('Unknown')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<StatusLabel status={IntegrationStatusEnum.AVAILABLE} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
