export function DateCell(props: { dateString?: string | null }) {
  if (!props.dateString) {
    return <span>Unknown</span>
  }
  const date = new Date(props.dateString)
  return (
    <div className="py-3">
      <span className="whitespace-nowrap">{date.toLocaleDateString()}</span>{' '}
      <span className="whitespace-nowrap">{date.toLocaleTimeString()}</span>
    </div>
  )
}
