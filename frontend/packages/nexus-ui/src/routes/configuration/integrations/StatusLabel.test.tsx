import { IntegrationStatusEnum } from '@syntara/contracts'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  it('shows tooltip with error message on hover for error status', async () => {
    const user = userEvent.setup()
    render(<StatusLabel status={IntegrationStatusEnum.ERROR} errorMessage="Connection refused" />)

    await user.hover(screen.getByText('Error'))
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Connection refused')
  })

  it('does not show tooltip when error status has no error message', async () => {
    const user = userEvent.setup()
    render(<StatusLabel status={IntegrationStatusEnum.ERROR} />)

    await user.hover(screen.getByText('Error'))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('does not show tooltip for non-error status even with error message', async () => {
    const user = userEvent.setup()
    render(<StatusLabel status={IntegrationStatusEnum.AVAILABLE} errorMessage="stale error" />)

    await user.hover(screen.getByText('Available'))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('shows tooltip on keyboard focus for error status', async () => {
    const user = userEvent.setup()
    render(<StatusLabel status={IntegrationStatusEnum.ERROR} errorMessage="Connection refused" />)

    await user.tab()
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Connection refused')
  })

  it('has no accessibility violations with error tooltip', async () => {
    const { container } = render(<StatusLabel status={IntegrationStatusEnum.ERROR} errorMessage="Connection refused" />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
