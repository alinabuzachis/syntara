export function AppPageHeader(props: { title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="glass flex min-w-0 flex-wrap items-center gap-4 rounded-4xl border-2 px-8 py-6">
      {typeof props.title === 'string' ? (
        <span className="text-xl font-bold text-white">{props.title}</span>
      ) : (
        <div className="min-w-0 flex-1">{props.title}</div>
      )}
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-4">{props.children}</div>
    </div>
  )
}
