import { AppLeftBar } from './AppLeftBar'
import { AppRightBar } from './AppRightBar'

export function AppPage(props: { children: React.ReactNode }) {
  return (
    <div className="flex grow overflow-hidden">
      <AppLeftBar />
      <div className="flex max-h-full min-w-0 grow flex-col gap-2 pb-8">{props.children}</div>
      <AppRightBar />
    </div>
  )
}
