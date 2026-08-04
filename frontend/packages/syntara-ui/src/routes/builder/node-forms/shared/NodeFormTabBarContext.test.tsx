import { render, renderHook, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { NodeFormTabBarProvider } from './NodeFormTabBarContext'
import { useNodeFormTabBar } from './useNodeFormTabBar'

describe('NodeFormTabBarContext', () => {
  describe('useNodeFormTabBar', () => {
    it('returns undefined when used without a provider', () => {
      const { result } = renderHook(() => useNodeFormTabBar())

      expect(result.current).toBeUndefined()
    })

    it('returns the tabBarAction when used inside NodeFormTabBarProvider', () => {
      const testAction = <button type="button">Test Action</button>

      const { result } = renderHook(() => useNodeFormTabBar(), {
        wrapper: ({ children }) => (
          <NodeFormTabBarProvider tabBarAction={testAction}>{children}</NodeFormTabBarProvider>
        ),
      })

      expect(result.current).toBe(testAction)
    })

    it('returns undefined when provider has no tabBarAction', () => {
      const { result } = renderHook(() => useNodeFormTabBar(), {
        wrapper: ({ children }) => <NodeFormTabBarProvider>{children}</NodeFormTabBarProvider>,
      })

      expect(result.current).toBeUndefined()
    })
  })

  describe('NodeFormTabBarProvider', () => {
    it('provides the tabBarAction value to children', () => {
      const testAction = <button type="button">Custom Action</button>

      function TestConsumer() {
        const action = useNodeFormTabBar()
        return <div>{action}</div>
      }

      render(
        <NodeFormTabBarProvider tabBarAction={testAction}>
          <TestConsumer />
        </NodeFormTabBarProvider>
      )

      expect(screen.getByRole('button', { name: 'Custom Action' })).toBeInTheDocument()
    })

    it('renders children correctly', () => {
      render(
        <NodeFormTabBarProvider>
          <div>Child Content</div>
        </NodeFormTabBarProvider>
      )

      expect(screen.getByText('Child Content')).toBeInTheDocument()
    })
  })

  describe('Integration', () => {
    it('allows multiple consumers to access the same tabBarAction', () => {
      const testAction = <button type="button">Shared Action</button>

      function Consumer({ id }: { id: string }) {
        const action = useNodeFormTabBar()
        return <div data-testid={id}>{action}</div>
      }

      render(
        <NodeFormTabBarProvider tabBarAction={testAction}>
          <Consumer id="consumer-1" />
          <Consumer id="consumer-2" />
        </NodeFormTabBarProvider>
      )

      const consumer1 = screen.getByTestId('consumer-1')
      const consumer2 = screen.getByTestId('consumer-2')

      expect(within(consumer1).getByRole('button')).toHaveTextContent('Shared Action')
      expect(within(consumer2).getByRole('button')).toHaveTextContent('Shared Action')
    })

    it('updates when tabBarAction changes', () => {
      const initialAction = <button type="button">Initial Action</button>
      const updatedAction = <button type="button">Updated Action</button>

      function TestConsumer() {
        const action = useNodeFormTabBar()
        return <div>{action}</div>
      }

      const { rerender } = render(
        <NodeFormTabBarProvider tabBarAction={initialAction}>
          <TestConsumer />
        </NodeFormTabBarProvider>
      )

      expect(screen.getByRole('button', { name: 'Initial Action' })).toBeInTheDocument()

      rerender(
        <NodeFormTabBarProvider tabBarAction={updatedAction}>
          <TestConsumer />
        </NodeFormTabBarProvider>
      )

      expect(screen.queryByRole('button', { name: 'Initial Action' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Updated Action' })).toBeInTheDocument()
    })

    it('supports complex ReactNode as tabBarAction', () => {
      const complexAction = (
        <div>
          <button type="button">Primary</button>
          <button type="button">Secondary</button>
        </div>
      )

      function TestConsumer() {
        const action = useNodeFormTabBar()
        return <div>{action}</div>
      }

      render(
        <NodeFormTabBarProvider tabBarAction={complexAction}>
          <TestConsumer />
        </NodeFormTabBarProvider>
      )

      expect(screen.getByRole('button', { name: 'Primary' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Secondary' })).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('has no accessibility violations with tabBarAction', async () => {
      const testAction = <button type="button">Accessible Action</button>

      function TestConsumer() {
        const action = useNodeFormTabBar()
        return <div>{action}</div>
      }

      const { container } = render(
        <NodeFormTabBarProvider tabBarAction={testAction}>
          <TestConsumer />
        </NodeFormTabBarProvider>
      )

      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('has no accessibility violations without tabBarAction', async () => {
      const { container } = render(
        <NodeFormTabBarProvider>
          <div>Content</div>
        </NodeFormTabBarProvider>
      )

      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })
  })
})
