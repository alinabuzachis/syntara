import { AlertProvider, Compass, CompassHeader, CompassContent } from '@ansible/nexus-ui-framework'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { RedHatIcon } from '../components/icons/RedHatIcon'

import { AppLeftBar } from './AppLeftBar'
import { AppLogin } from './AppLogin'
import { AppNavigation } from './AppNavigation'
import { AppRightBar } from './AppRightBar'
import { AppRouter } from './AppRouter'

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AlertProvider>
        <AppLogin>
          <Compass
            backgroundSrcDark="/background.jpg"
            backgroundSrcLight="/background.jpg"
            header={
              <CompassHeader
                logo={
                  <div className="flex items-center gap-4">
                    <RedHatIcon />
                    <div className="flex flex-col">
                      <span className="text-sm font-extrabold text-[#e00]">Red Hat</span>
                      <span className="text-4xl leading-7 font-bold text-white">Automation</span>
                    </div>
                  </div>
                }
                nav={<AppNavigation />}
                profile={
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col text-right">
                      <span className="text-lg leading-5 text-white">Demo</span>
                      <span className="text-sm leading-5 text-white/70">Coffee</span>
                    </div>
                    <div className="glass flex h-12 w-12 items-center justify-center rounded-full border text-xl text-white">
                      DC
                    </div>
                  </div>
                }
              />
            }
            sidebarStart={<AppLeftBar />}
            sidebarEnd={<AppRightBar />}
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
