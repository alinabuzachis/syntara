import { Compass, CompassContent } from '@patternfly/react-core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { AlertProvider } from '../components/alerts'

import { AppDockedNav } from './AppDockedNav'
import { AppLogin } from './AppLogin'
import { AppRouter } from './AppRouter'
import { UnsavedChangesProvider } from './UnsavedChangesProvider'

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AlertProvider>
        <UnsavedChangesProvider>
          <AppLogin>
            <Compass
              className="pf-m-no-screen-warning"
              backgroundSrcDark="/src/assets/background.jpg"
              backgroundSrcLight="/src/assets/background.jpg"
              dock={<AppDockedNav />}
              main={
                <CompassContent>
                  <AppRouter />
                </CompassContent>
              }
            />
          </AppLogin>
        </UnsavedChangesProvider>
      </AlertProvider>
    </QueryClientProvider>
  )
}
