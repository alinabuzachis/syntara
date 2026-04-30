import { Stack, StackItem } from '@patternfly/react-core'
import { Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { ScrollableTableContainer } from './ScrollableTableContainer'

describe('ScrollableTableContainer', () => {
  const minimalTable = (
    <>
      <Thead>
        <Tr>
          <Th>Column A</Th>
        </Tr>
      </Thead>
      <Tbody>
        <Tr>
          <Td>Value</Td>
        </Tr>
      </Tbody>
    </>
  )

  it('renders table content when used as a direct child of Stack', () => {
    render(
      <Stack style={{ height: '240px' }}>
        <ScrollableTableContainer aria-label="Demo table">{minimalTable}</ScrollableTableContainer>
      </Stack>
    )

    expect(screen.getByRole('grid', { name: 'Demo table' })).toBeInTheDocument()
  })

  it('has no accessibility violations in the supported Stack layout', async () => {
    const { container } = render(
      <Stack style={{ height: '240px' }}>
        <ScrollableTableContainer aria-label="Accessible table">{minimalTable}</ScrollableTableContainer>
      </Stack>
    )

    expect(await axe(container)).toHaveNoViolations()
  })

  /**
   * The component’s root is a `StackItem` with `data-testid="scrollable-table-container-root"`. It must
   * be a direct child of the page `Stack` (see `ScrollableTableContainer` JSDoc). Nesting it inside
   * another `StackItem` breaks flex height.
   */
  it('root is a direct child of the page Stack in the supported layout', () => {
    render(
      <Stack aria-label="Fixture page stack" role="region" style={{ height: '240px' }}>
        <ScrollableTableContainer aria-label="Layout table">{minimalTable}</ScrollableTableContainer>
      </Stack>
    )

    const pageStack = screen.getByRole('region', { name: 'Fixture page stack' })
    const stcRoot = screen.getByTestId('scrollable-table-container-root')
    /* eslint-disable testing-library/no-node-access -- parent link is the structural contract; STC root is not a role. */
    expect(stcRoot.parentElement).toBe(pageStack)
    /* eslint-enable testing-library/no-node-access */
    expect(within(stcRoot).getByRole('grid', { name: 'Layout table' })).toBeInTheDocument()
  })

  it('is not a direct child of the page Stack when wrapped in an extra StackItem (invalid nesting)', () => {
    render(
      <Stack aria-label="Fixture page stack" role="region" style={{ height: '240px' }}>
        <StackItem isFilled>
          <ScrollableTableContainer aria-label="Nested layout table">{minimalTable}</ScrollableTableContainer>
        </StackItem>
      </Stack>
    )

    const pageStack = screen.getByRole('region', { name: 'Fixture page stack' })
    const stcRoot = screen.getByTestId('scrollable-table-container-root')
    /* eslint-disable testing-library/no-node-access */
    expect(stcRoot.parentElement).not.toBe(pageStack)
    /* eslint-enable testing-library/no-node-access */
    expect(within(stcRoot).getByRole('grid', { name: 'Nested layout table' })).toBeInTheDocument()
  })
})
