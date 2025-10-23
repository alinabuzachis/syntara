export function Detail(props: { label: string; children?: React.ReactNode }) {
  if (!props.children || props.children === null) {
    return null
  }
  return (
    <>
      <dt>{props.label}</dt>
      <dd>{props.children}</dd>
    </>
  )
}
