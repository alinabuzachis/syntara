import { AppLeftBar } from './AppLeftBar'
import { AppRightBar } from './AppRightBar'

export function AppPage(props: { children: React.ReactNode }) {
  return (
    <div className="flex grow overflow-hidden">
      <AppLeftBar />
      <div className="flex max-h-full grow flex-col gap-4 pb-8">{props.children}</div>
      <AppRightBar />
    </div>
  )
}
