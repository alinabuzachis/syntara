import { render } from '@testing-library/react'
import { cloneElement, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'

/**
 * Test utility to render a form component with header content handling.
 * This allows testing forms that use onHeaderContentChange prop.
 *
 * @param ui - The React element to render (typically a form component)
 * @returns The result from @testing-library/react's render function
 *
 * @example
 * ```tsx
 * renderWithHeader(<MyForm onSubmit={mockOnSubmit} />)
 * ```
 */
export function renderWithHeader(ui: ReactElement) {
  function Wrapper() {
    const [headerContent, setHeaderContent] = useState<ReactNode | null>(null)
    return (
      <>
        {headerContent}
        {cloneElement(ui as ReactElement<{ onHeaderContentChange?: (content: ReactNode | null) => void }>, {
          onHeaderContentChange: setHeaderContent,
        })}
      </>
    )
  }

  return render(<Wrapper />)
}
