export function NodeTitle(props: { name?: string; type: string }) {
  if (props.name) {
    return (
      <div>
        <label className="text-lg font-bold">{props.name}</label>
        <div className="text-xs text-white/60">{props.type}</div>
      </div>
    )
  }
  return <div className="text-lg font-bold">{props.type}</div>
}
