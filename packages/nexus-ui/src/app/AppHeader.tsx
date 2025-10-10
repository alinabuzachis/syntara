import { RedHatIcon } from '../components/icons/RedHatIcon'
import { AppNavigation } from './AppNavigation'

export function AppHeader() {
  return (
    <div className="flex justify-center p-8 pb-8">
      <div className="absolute top-7 left-8 flex items-center gap-4">
        <RedHatIcon />
        <div className="flex flex-col">
          <span className="text-sm font-extrabold text-[#e00]">Red Hat</span>
          <span className="text-4xl leading-7 font-bold text-white">Automation</span>
        </div>
      </div>

      <AppNavigation />

      <div className="absolute top-8 right-8 flex flex-row items-center gap-4">
        <div className="flex flex-col text-right">
          <span className="text-lg leading-5 text-white">Demo</span>
          <span className="text-sm leading-5 text-white/70">Coffee</span>
        </div>
        <div className="glass flex h-12 w-12 flex-row items-center justify-center gap-4 rounded-full border text-xl text-white">
          DC
        </div>
      </div>
    </div>
  )
}
