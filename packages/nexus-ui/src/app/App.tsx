import { AlertProvider } from '@ansible/nexus-ui-framework'
import { Compass, CompassContent } from '@patternfly/react-core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { AppDockedNav } from './AppDockedNav'
import { AppLogin } from './AppLogin'
import { AppRouter } from './AppRouter'

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AlertProvider>
        <AppLogin>
          <Compass
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
      </AlertProvider>
    </QueryClientProvider>
  )
}
