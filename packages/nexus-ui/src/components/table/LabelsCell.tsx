export function LabelsCell(props: { labels?: Record<string, string> | null }) {
  if (!props.labels) {
    return null
  }
  return (
    <div className="py-3">
      {Object.entries(props.labels).map(([key, value]) => (
        <span
          key={key}
          className="mr-2 mb-2 inline-block rounded-full bg-gray-200 px-3 py-1 text-sm font-semibold text-gray-700"
        >
          {key}={value}
        </span>
      ))}
    </div>
  )
}
