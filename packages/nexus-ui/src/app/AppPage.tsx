export function AppPage(props: { children: React.ReactNode }) {
  return (
    <div className="flex grow overflow-hidden">
      <div className="flex max-h-full min-w-0 grow flex-col gap-2 pb-8">{props.children}</div>
    </div>
  )
}
