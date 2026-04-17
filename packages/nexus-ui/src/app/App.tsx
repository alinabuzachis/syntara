import { Compass, CompassContent } from '@patternfly/react-core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { AlertProvider } from '../components/alerts'
import { ColorSchemeProvider } from '../theme/ColorSchemeProvider'

import { AppDockedNav } from './AppDockedNav'
import { AppLogin } from './AppLogin'
import { AppRouter } from './AppRouter'
import { UnsavedChangesProvider } from './UnsavedChangesProvider'

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ColorSchemeProvider>
        <AlertProvider>
          <UnsavedChangesProvider>
            <AppLogin>
              <Compass
                className="pf-m-no-screen-warning bg-deep-space"
                dock={<AppDockedNav />}
                main={
                  <CompassContent role="main">
                    <AppRouter />
                  </CompassContent>
                }
              />
            </AppLogin>
          </UnsavedChangesProvider>
        </AlertProvider>
      </ColorSchemeProvider>
    </QueryClientProvider>
  )
}
