export function ErrorState(props: { title?: string; message: unknown }) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="glass rounded-2xl border px-6 py-4">
        {props.title && <div className="mb-2 text-lg font-bold">{props.title}</div>}
        <div className="text-red-400">{String(props.message)}</div>
      </div>
    </div>
  )
}
