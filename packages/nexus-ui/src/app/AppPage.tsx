export function AppPage(props: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 grow overflow-auto">
      <div className="flex min-h-0 min-w-0 grow flex-col gap-2 pb-4">{props.children}</div>
    </div>
  )
}
