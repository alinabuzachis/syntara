import { AlertProvider } from '@ansible/nexus-ui-framework'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { AppHeader } from './AppHeader'
import { AppLogin } from './AppLogin'
import { AppRouter } from './AppRouter'

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AlertProvider>
        <AppLogin>
          <AppHeader />
          <AppRouter />
        </AppLogin>
      </AlertProvider>
    </QueryClientProvider>
  )
}
