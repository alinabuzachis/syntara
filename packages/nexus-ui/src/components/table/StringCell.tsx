export function StringCell(props: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--pf-t--global--spacer--xs)' }}>
      {props.children}
    </div>
  )
}
