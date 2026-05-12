import type { Preview } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useMemo } from 'react'
import '../src/index.css'

const preview: Preview = {
  decorators: [
    (Story) => {
      const client = useMemo(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }), [])
      return (
        <QueryClientProvider client={client}>
          <Story />
        </QueryClientProvider>
      )
    },
  ],
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    options: {
      storySort: { method: 'alphabetical' },
    },
  },
}
export default preview
