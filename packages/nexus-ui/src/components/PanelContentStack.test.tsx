import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { PanelContentStack } from './PanelContentStack'

describe('PanelContentStack', () => {
  it('renders children with default panel stack styles', () => {
    render(
      <PanelContentStack>
        <div>Main</div>
      </PanelContentStack>
    )

    const child = screen.getByText('Main')
    /* eslint-disable testing-library/no-node-access -- Stack is a layout div with no role; assert styles on the PF wrapper (testing guideline prefer queries first on children). */
    expect(child.parentElement).toHaveStyle({
      height: '100%',
      flexGrow: 1,
      minHeight: '0px',
    })
    /* eslint-enable testing-library/no-node-access */
  })

  it('renders pageGutter variant', () => {
    render(
      <PanelContentStack variant="pageGutter">
        <span>List</span>
      </PanelContentStack>
    )

    const child = screen.getByText('List')
    /* eslint-disable testing-library/no-node-access -- Stack root has no accessible role; style + padding token checked via parent of known text. */
    expect(child.parentElement).toHaveStyle({ flexGrow: 1 })
    expect(child.parentElement?.getAttribute('style')).toContain('var(--pf-t--global--spacer--sm)')
    /* eslint-enable testing-library/no-node-access */
  })

  describe('Accessibility', () => {
    it('has no accessibility violations with minimal content', async () => {
      const { container } = render(
        <PanelContentStack>
          <main>
            <h1>Title</h1>
          </main>
        </PanelContentStack>
      )
      expect(await axe(container)).toHaveNoViolations()
    })
  })
})
