import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'

import { AppRoute } from '../../app/AppRoute'
import { REACT_FLOW_VIEWPORT_EMPTY_STATE } from '../../constants/viewport'

import { NxReactFlowViewportGuard } from './NxReactFlowViewportGuard'

const mockSetLocation = vi.fn()

vi.mock('../../hooks/routing/useNavigate', () => ({
  useNavigate: () => mockSetLocation,
}))

describe('NxReactFlowViewportGuard', () => {
  beforeEach(() => {
    mockSetLocation.mockReset()
  })

  it('renders canvas content at supported viewport sizes', () => {
    render(
      <NxReactFlowViewportGuard>
        <div>Workflow canvas</div>
      </NxReactFlowViewportGuard>
    )

    expect(screen.getByText('Workflow canvas')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: REACT_FLOW_VIEWPORT_EMPTY_STATE.title })).not.toBeInTheDocument()
  })

  it('navigates to workflows when Return to Workflows is clicked', async () => {
    const user = userEvent.setup()

    render(
      <NxReactFlowViewportGuard>
        <div>Workflow canvas</div>
      </NxReactFlowViewportGuard>
    )

    const returnButton = screen.getByRole('button', {
      name: REACT_FLOW_VIEWPORT_EMPTY_STATE.returnLabel,
      hidden: true,
    })
    await user.click(returnButton)

    expect(mockSetLocation).toHaveBeenCalledWith(AppRoute.Workflows.Root)
  })

  it('navigates to custom destination when onReturn callback is provided', async () => {
    const user = userEvent.setup()
    const customReturn = vi.fn()

    render(
      <NxReactFlowViewportGuard onReturn={customReturn}>
        <div>Workflow canvas</div>
      </NxReactFlowViewportGuard>
    )

    const returnButton = screen.getByRole('button', {
      name: REACT_FLOW_VIEWPORT_EMPTY_STATE.returnLabel,
      hidden: true,
    })
    await user.click(returnButton)

    expect(customReturn).toHaveBeenCalledTimes(1)
    expect(mockSetLocation).not.toHaveBeenCalled()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <NxReactFlowViewportGuard>
        <div>Workflow canvas</div>
      </NxReactFlowViewportGuard>
    )

    expect(await axe(container)).toHaveNoViolations()
  })
})
