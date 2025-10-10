export function AppPageHeader(props: { title: string; children?: React.ReactNode }) {
  return (
    <div className="glass flex items-center gap-8 rounded-4xl border px-8 py-6">
      <span className="text-xl font-bold text-white">{props.title}</span>
      {props.children}
    </div>
  )
}
