import clsx from 'clsx'

type CardProps = {
  variant?: 'glass' | 'solid' | 'outline'
  padding?: 'none' | 'sm' | 'md' | 'lg'
  children: React.ReactNode
  className?: string
} & React.HTMLAttributes<HTMLDivElement>

export function Card({ variant = 'glass', padding = 'md', children, className, ...rest }: CardProps) {
  return (
    <div
      className={clsx(
        'rounded-lg',
        {
          'glass border': variant === 'glass',
          'border border-white/10 bg-white/5': variant === 'solid',
          'border border-white/20': variant === 'outline',
        },
        {
          'p-0': padding === 'none',
          'p-3': padding === 'sm',
          'p-4': padding === 'md',
          'p-6': padding === 'lg',
        },
        className
      )}
      {...rest}
    >
      {children}
    </div>
  )
}
