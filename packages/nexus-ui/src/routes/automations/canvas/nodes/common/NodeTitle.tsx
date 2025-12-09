export function NodeTitle(props: { title?: string; subTitle?: string }) {
  return (
    <div className="grow">
      {props.title ? (
        <h2 className="pr-2 text-base font-bold">{props.title}</h2>
      ) : (
        <h2 className="pr-2 text-base font-bold">{props.subTitle}</h2>
      )}
      {props.title && props.subTitle && <div className="text-xs text-white/60">{props.subTitle}</div>}
    </div>
  )
}
