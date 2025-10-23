export function CodeBlock(props: { children?: React.ReactNode; jsonObject?: object }) {
  return (
    <pre className="overflow-auto rounded-xl bg-black/30 px-4 py-2 leading-8">
      {props.children ?? (props.jsonObject && JSON.stringify(props.jsonObject, undefined, 2))}
    </pre>
  )
}
