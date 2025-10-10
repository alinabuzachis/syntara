import clsx from 'clsx'

type IconButtonProps = {
  children: React.ReactNode
} & React.ButtonHTMLAttributes<HTMLButtonElement>
export function IconButton(props: IconButtonProps) {
  const { children, className, ...rest } = props
  return (
    <div className="group flex h-12 min-h-12 w-12 min-w-12 items-center justify-center">
      <button
        className={clsx(
          'flex min-h-11 min-w-11 items-center justify-center rounded-full group-hover:bg-white/10',
          className
        )}
        {...rest}
      >
        {children}
      </button>
    </div>
  )
}
